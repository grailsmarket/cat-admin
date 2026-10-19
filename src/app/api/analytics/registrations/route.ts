import { NextRequest, NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { buildReferrerCaseExpression, SOURCE_NAMES, type SourceName } from '@/constants/referrers'

function getTimeBucket(fromDate: Date, toDate: Date): { truncUnit: string; seriesInterval: string } {
  const diffMs = toDate.getTime() - fromDate.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays <= 2) {
    return { truncUnit: 'hour', seriesInterval: '1 hour' }
  } else if (diffDays <= 90) {
    return { truncUnit: 'day', seriesInterval: '1 day' }
  } else {
    return { truncUnit: 'week', seriesInterval: '1 week' }
  }
}

const VALID_BUCKETS: Record<string, { truncUnit: string; seriesInterval: string }> = {
  hour: { truncUnit: 'hour', seriesInterval: '1 hour' },
  day: { truncUnit: 'day', seriesInterval: '1 day' },
  week: { truncUnit: 'week', seriesInterval: '1 week' },
  month: { truncUnit: 'month', seriesInterval: '1 month' },
}

export async function GET(request: NextRequest) {
  const access = await requireAccess(request, 'analytics')
  if (!access.ok) return access.response

  const searchParams = request.nextUrl.searchParams
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'Missing required parameters: from, to' }, { status: 400 })
  }

  const fromDate = new Date(fromParam)
  const toDate = new Date(toParam)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  if (fromDate >= toDate) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  const bucketParam = searchParams.get('bucket')
  const bucketConfig = bucketParam && VALID_BUCKETS[bucketParam]
    ? VALID_BUCKETS[bucketParam]
    : getTimeBucket(fromDate, toDate)
  const { truncUnit, seriesInterval } = bucketConfig

  const sourceCaseExpr = buildReferrerCaseExpression()

  const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60

  const buildQuery = (table: string, dateColumn: string, costColumn: string, durationExpr: string) => `
    WITH time_series AS (
      SELECT generate_series(
        DATE_TRUNC('${truncUnit}', $1::timestamptz),
        DATE_TRUNC('${truncUnit}', $2::timestamptz),
        '${seriesInterval}'::interval
      ) AS date
    ),
    source_mapped AS (
      SELECT
        ${dateColumn},
        ${costColumn},
        (${durationExpr}) AS duration_secs,
        ${sourceCaseExpr} AS source
      FROM ${table}
      WHERE ${dateColumn} >= $1::timestamptz
        AND ${dateColumn} < $2::timestamptz
    ),
    grouped AS (
      SELECT
        DATE_TRUNC('${truncUnit}', ${dateColumn}) AS date,
        COUNT(*) AS total,
        ${SOURCE_NAMES.map((name) => `COUNT(*) FILTER (WHERE source = '${name}') AS ${name},`).join('\n        ')}
        COALESCE(SUM(NULLIF(${costColumn}, '')::numeric), 0) / 1e18 AS total_cost_eth,
        ${SOURCE_NAMES.map((name) => `COALESCE(SUM(NULLIF(${costColumn}, '')::numeric) FILTER (WHERE source = '${name}'), 0) / 1e18 AS ${name}_cost_eth,`).join('\n        ')}
        COALESCE(SUM(duration_secs), 0) / ${SECONDS_PER_YEAR} AS total_duration_years,
        ${SOURCE_NAMES.map((name) => `COALESCE(SUM(duration_secs) FILTER (WHERE source = '${name}'), 0) / ${SECONDS_PER_YEAR} AS ${name}_duration_years`).join(',\n        ')}
      FROM source_mapped
      GROUP BY DATE_TRUNC('${truncUnit}', ${dateColumn})
    )
    SELECT
      ts.date,
      COALESCE(g.total, 0)::int AS total,
      ${SOURCE_NAMES.map((name) => `COALESCE(g.${name}, 0)::int AS ${name},`).join('\n      ')}
      COALESCE(g.total_cost_eth, 0)::float AS total_cost_eth,
      ${SOURCE_NAMES.map((name) => `COALESCE(g.${name}_cost_eth, 0)::float AS ${name}_cost_eth,`).join('\n      ')}
      COALESCE(g.total_duration_years, 0)::float AS total_duration_years,
      ${SOURCE_NAMES.map((name) => `COALESCE(g.${name}_duration_years, 0)::float AS ${name}_duration_years`).join(',\n      ')}
    FROM time_series ts
    LEFT JOIN grouped g ON ts.date = g.date
    ORDER BY ts.date ASC`

  try {
    const pool = getPool()
    const params = [fromDate.toISOString(), toDate.toISOString()]

    const [registrationsResult, renewalsResult] = await Promise.all([
      pool.query(
        buildQuery(
          'registrations',
          'registration_date',
          'total_cost_wei',
          'EXTRACT(EPOCH FROM (expiry_date - registration_date))'
        ),
        params
      ),
      pool.query(
        buildQuery('renewals', 'renewal_date', 'cost_wei', 'duration_seconds'),
        params
      ),
    ])

    // Build one row per bucket with total + a value per source, reading each source from column `${source}${suffix}`
    const mapBreakdown = (rows: Array<Record<string, unknown>>, totalColumn: string, suffix: string) =>
      rows.map((row) => {
        const mapped = {
          date: (row.date as Date).toISOString(),
          total: row[totalColumn] as number,
        } as { date: string; total: number } & Record<SourceName, number>
        for (const name of SOURCE_NAMES) {
          mapped[name] = row[`${name}${suffix}`] as number
        }
        return mapped
      })

    const mapRows = (rows: Array<Record<string, unknown>>) => mapBreakdown(rows, 'total', '')
    const mapCostRows = (rows: Array<Record<string, unknown>>) =>
      mapBreakdown(rows, 'total_cost_eth', '_cost_eth')
    const mapDurationRows = (rows: Array<Record<string, unknown>>) =>
      mapBreakdown(rows, 'total_duration_years', '_duration_years')

    const registrations = mapRows(registrationsResult.rows)
    const renewals = mapRows(renewalsResult.rows)
    const registrationsCost = mapCostRows(registrationsResult.rows)
    const renewalsCost = mapCostRows(renewalsResult.rows)
    const registrationsDuration = mapDurationRows(registrationsResult.rows)
    const renewalsDuration = mapDurationRows(renewalsResult.rows)

    const sumBySource = (rows: typeof registrations) => {
      const result: Record<string, number> = {}
      for (const name of SOURCE_NAMES) {
        result[name] = rows.reduce((sum, row) => sum + (row[name] ?? 0), 0)
      }
      return result
    }

    return NextResponse.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        bucket: truncUnit,
        registrations,
        renewals,
        registrationsCost,
        renewalsCost,
        registrationsDuration,
        renewalsDuration,
        summary: {
          totalRegistrations: registrations.reduce((sum, r) => sum + r.total, 0),
          totalRenewals: renewals.reduce((sum, r) => sum + r.total, 0),
          totalRegistrationCostEth: registrationsCost.reduce((sum, r) => sum + r.total, 0),
          totalRenewalCostEth: renewalsCost.reduce((sum, r) => sum + r.total, 0),
          totalRegistrationDurationYears: registrationsDuration.reduce((sum, r) => sum + r.total, 0),
          totalRenewalDurationYears: renewalsDuration.reduce((sum, r) => sum + r.total, 0),
          registrationsBySource: sumBySource(registrations),
          renewalsBySource: sumBySource(renewals),
          registrationsCostBySource: sumBySource(registrationsCost),
          renewalsCostBySource: sumBySource(renewalsCost),
          registrationsDurationBySource: sumBySource(registrationsDuration),
          renewalsDurationBySource: sumBySource(renewalsDuration),
        },
      },
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
