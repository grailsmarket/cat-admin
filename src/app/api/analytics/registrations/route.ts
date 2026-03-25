import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { buildReferrerCaseExpression, SOURCE_NAMES } from '@/constants/referrers'

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

const VALID_TRUNC_UNITS = ['hour', 'day', 'week'] as const
const VALID_SERIES_INTERVALS = ['1 hour', '1 day', '1 week'] as const

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const { truncUnit, seriesInterval } = getTimeBucket(fromDate, toDate)

  // Validate truncUnit and seriesInterval are from our whitelist (defense in depth)
  if (
    !(VALID_TRUNC_UNITS as readonly string[]).includes(truncUnit) ||
    !(VALID_SERIES_INTERVALS as readonly string[]).includes(seriesInterval)
  ) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const sourceCaseExpr = buildReferrerCaseExpression()

  const buildQuery = (table: string, dateColumn: string) => `
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
        ${sourceCaseExpr} AS source
      FROM ${table}
      WHERE ${dateColumn} >= $1::timestamptz
        AND ${dateColumn} < $2::timestamptz
    ),
    grouped AS (
      SELECT
        DATE_TRUNC('${truncUnit}', ${dateColumn}) AS date,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE source = 'grails') AS grails,
        COUNT(*) FILTER (WHERE source = 'vision') AS vision,
        COUNT(*) FILTER (WHERE source = 'snipezone') AS snipezone,
        COUNT(*) FILTER (WHERE source = 'enstools') AS enstools,
        COUNT(*) FILTER (WHERE source = 'rotki') AS rotki,
        COUNT(*) FILTER (WHERE source = 'direct') AS direct
      FROM source_mapped
      GROUP BY DATE_TRUNC('${truncUnit}', ${dateColumn})
    )
    SELECT
      ts.date,
      COALESCE(g.total, 0)::int AS total,
      COALESCE(g.grails, 0)::int AS grails,
      COALESCE(g.vision, 0)::int AS vision,
      COALESCE(g.snipezone, 0)::int AS snipezone,
      COALESCE(g.enstools, 0)::int AS enstools,
      COALESCE(g.rotki, 0)::int AS rotki,
      COALESCE(g.direct, 0)::int AS direct
    FROM time_series ts
    LEFT JOIN grouped g ON ts.date = g.date
    ORDER BY ts.date ASC`

  try {
    const pool = getPool()
    const params = [fromDate.toISOString(), toDate.toISOString()]

    const [registrationsResult, renewalsResult] = await Promise.all([
      pool.query(buildQuery('registrations', 'registration_date'), params),
      pool.query(buildQuery('renewals', 'renewal_date'), params),
    ])

    const mapRows = (rows: Array<Record<string, unknown>>) =>
      rows.map((row) => ({
        date: (row.date as Date).toISOString(),
        total: row.total as number,
        grails: row.grails as number,
        vision: row.vision as number,
        snipezone: row.snipezone as number,
        enstools: row.enstools as number,
        rotki: row.rotki as number,
        direct: row.direct as number,
      }))

    const registrations = mapRows(registrationsResult.rows)
    const renewals = mapRows(renewalsResult.rows)

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
        summary: {
          totalRegistrations: registrations.reduce((sum, r) => sum + r.total, 0),
          totalRenewals: renewals.reduce((sum, r) => sum + r.total, 0),
          registrationsBySource: sumBySource(registrations),
          renewalsBySource: sumBySource(renewals),
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
