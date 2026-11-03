import { NextRequest, NextResponse } from 'next/server'
import { requireAccess } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { parseRangeEnd } from '@/lib/dateRange'
import { getRouterTxHashes } from '@/lib/rpc'
import { buildReferrerCaseExpression, GRAILS_REFERRERS, SMART_ACCOUNT_RELAYERS } from '@/constants/referrers'

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60
const DAY = 24 * 60 * 60

// Query params shared by every query below:
//   $1 from, $2 to (exclusive), $3 Grails referrer codes, $4 GrailsETHRouter tx hashes,
//   $5 smart-account relayer wallets
//
// Channel of a row: Grails split by payment (ETH through the router, or USDC/DAI), then the
// smart-account relay (likely the ENS app), then the other referrer sources ('direct' = no
// referrer or an unknown one).
function channelExpression(walletColumn: string): string {
  return `CASE
      WHEN referrer = ANY($3::text[]) AND LOWER(transaction_hash) = ANY($4::text[]) THEN 'grails_eth'
      WHEN referrer = ANY($3::text[]) THEN 'grails_stable'
      WHEN LOWER(${walletColumn}) = ANY($5::text[]) THEN 'relay'
      ELSE ${buildReferrerCaseExpression()}
    END`
}

// ETHRenewerV1.syncWrapper() was recorded as a cost-0 "renewal" by the v1 indexer until the
// indexer fix; those rows aren't renewals. A real ENSv2 renewal can briefly look like this too,
// until the v2 indexer fills in its cost, so it may appear a little late.
const NOT_SYNC_WRAPPER = `NOT (cost_wei = '0' AND metadata->>'source' = 'controller')`

const renewalsCte = (fromParam: string, toParam: string) => `
  ren AS (
    SELECT
      transaction_hash,
      LOWER(renewer_address) AS wallet,
      cost_usd::float AS usd,
      duration_seconds::float AS duration_seconds,
      new_expiry_date,
      renewal_date,
      ${channelExpression('renewer_address')} AS channel
    FROM renewals
    WHERE renewal_date >= ${fromParam} AND renewal_date < ${toParam}
      AND ${NOT_SYNC_WRAPPER}
  )`

const registrationsCte = `
  reg AS (
    SELECT
      transaction_hash,
      LOWER(registrant_address) AS wallet,
      total_cost_usd::float AS usd,
      EXTRACT(EPOCH FROM (expiry_date - registration_date))::float AS duration_seconds,
      ${channelExpression('registrant_address')} AS channel
    FROM registrations
    WHERE registration_date >= $1::timestamptz AND registration_date < $2::timestamptz
  )`

const IS_GRAILS = `channel IN ('grails_eth', 'grails_stable')`

// Grails share counted five ways, for renewals and for registrations
const measuresSelect = (cte: string) => `
  SELECT
    COUNT(*)::int AS names_total,
    COUNT(*) FILTER (WHERE ${IS_GRAILS})::int AS names_grails,
    COALESCE(SUM(usd), 0)::float AS usd_total,
    COALESCE(SUM(usd) FILTER (WHERE ${IS_GRAILS}), 0)::float AS usd_grails,
    (COALESCE(SUM(duration_seconds), 0) / ${SECONDS_PER_YEAR})::float AS years_total,
    (COALESCE(SUM(duration_seconds) FILTER (WHERE ${IS_GRAILS}), 0) / ${SECONDS_PER_YEAR})::float AS years_grails,
    COUNT(DISTINCT transaction_hash)::int AS txs_total,
    COUNT(DISTINCT transaction_hash) FILTER (WHERE ${IS_GRAILS})::int AS txs_grails,
    COUNT(DISTINCT wallet)::int AS wallets_total,
    COUNT(DISTINCT wallet) FILTER (WHERE ${IS_GRAILS})::int AS wallets_grails
  FROM ${cte}`

function getBucket(from: Date, to: Date): 'day' | 'week' {
  return (to.getTime() - from.getTime()) / 1000 / DAY > 120 ? 'week' : 'day'
}

type MeasureRow = Record<string, number>

function toMeasures(row: MeasureRow) {
  const measure = (key: string, label: string) => ({
    measure: label,
    grails: row[`${key}_grails`],
    total: row[`${key}_total`],
    share: row[`${key}_total`] > 0 ? row[`${key}_grails`] / row[`${key}_total`] : 0,
  })
  return [
    measure('names', 'Names'),
    measure('usd', 'USD paid'),
    measure('years', 'Name-years'),
    measure('txs', 'Transactions'),
    measure('wallets', 'Wallets'),
  ]
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
  const toDate = parseRangeEnd(toParam)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  if (fromDate >= toDate) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  // Router hashes come from chain logs. If the RPC is down, the page still loads, with every
  // Grails row counted as USDC/DAI and a warning shown.
  let routerHashes: string[] = []
  let routerError: string | null = null
  try {
    routerHashes = await getRouterTxHashes()
  } catch (error) {
    routerError = error instanceof Error ? error.message : 'Failed to read router logs'
    console.error('Market share: router log fetch failed:', error)
  }

  const periodMs = toDate.getTime() - fromDate.getTime()
  const previousFrom = new Date(fromDate.getTime() - periodMs)
  const bucket = getBucket(fromDate, toDate)

  const params = [
    fromDate.toISOString(),
    toDate.toISOString(),
    GRAILS_REFERRERS,
    routerHashes,
    SMART_ACCOUNT_RELAYERS.map((a) => a.toLowerCase()),
  ]

  try {
    const pool = getPool()

    const [
      renewalMeasures,
      registrationMeasures,
      renewalChannels,
      registrationChannels,
      series,
      weekly,
      comparison,
      topRenewers,
    ] = await Promise.all([
      pool.query(`WITH ${renewalsCte('$1::timestamptz', '$2::timestamptz')} ${measuresSelect('ren')}`, params),
      pool.query(`WITH ${registrationsCte} ${measuresSelect('reg')}`, params),

      // Per renewal channel: size, typical payment, renewal length and grace-period behaviour.
      // "Already expired": expiry before the renewal (new expiry - duration) was in the past.
      // "Still expired": the new expiry is still in the past, so the renewal only pushed back
      // the release date. Rows without a duration are left out of both.
      pool.query(
        `WITH ${renewalsCte('$1::timestamptz', '$2::timestamptz')}
        SELECT
          channel,
          COUNT(*)::int AS names,
          COUNT(DISTINCT transaction_hash)::int AS txs,
          COUNT(DISTINCT wallet)::int AS wallets,
          COALESCE(SUM(usd), 0)::float AS usd,
          (COALESCE(SUM(duration_seconds), 0) / ${SECONDS_PER_YEAR})::float AS name_years,
          (percentile_cont(0.5) WITHIN GROUP (ORDER BY usd))::float AS median_usd,
          COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL)::int AS with_duration,
          COUNT(*) FILTER (
            WHERE duration_seconds IS NOT NULL
              AND new_expiry_date - make_interval(secs => duration_seconds) < renewal_date
          )::int AS already_expired,
          COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL AND new_expiry_date < renewal_date)::int AS still_expired,
          COUNT(*) FILTER (WHERE duration_seconds < ${7 * DAY})::int AS d_under_7d,
          COUNT(*) FILTER (WHERE duration_seconds >= ${7 * DAY} AND duration_seconds < ${30 * DAY})::int AS d_7_29d,
          COUNT(*) FILTER (WHERE duration_seconds >= ${30 * DAY} AND duration_seconds < ${90 * DAY})::int AS d_30_89d,
          COUNT(*) FILTER (WHERE duration_seconds >= ${90 * DAY} AND duration_seconds < ${364 * DAY})::int AS d_90_363d,
          COUNT(*) FILTER (WHERE duration_seconds >= ${364 * DAY})::int AS d_1y_plus,
          COUNT(*) FILTER (WHERE duration_seconds IS NULL)::int AS d_unknown
        FROM ren
        GROUP BY channel
        ORDER BY names DESC`,
        params
      ),

      pool.query(
        `WITH ${registrationsCte}
        SELECT
          channel,
          COUNT(*)::int AS names,
          COUNT(DISTINCT transaction_hash)::int AS txs,
          COALESCE(SUM(usd), 0)::float AS usd
        FROM reg
        GROUP BY channel
        ORDER BY names DESC`,
        params
      ),

      // Renewals per day (or week for long ranges) in the selected period
      pool.query(
        `WITH ${renewalsCte('$1::timestamptz', '$2::timestamptz')},
        buckets AS (
          SELECT generate_series(
            DATE_TRUNC('${bucket}', $1::timestamptz),
            DATE_TRUNC('${bucket}', $2::timestamptz - interval '1 microsecond'),
            '1 ${bucket}'::interval
          ) AS date
        ),
        grouped AS (
          SELECT
            DATE_TRUNC('${bucket}', renewal_date) AS date,
            COUNT(*) FILTER (WHERE channel = 'grails_eth')::int AS grails_eth,
            COUNT(*) FILTER (WHERE channel = 'grails_stable')::int AS grails_stable,
            COUNT(*) FILTER (WHERE NOT ${IS_GRAILS})::int AS others
          FROM ren
          GROUP BY 1
        )
        SELECT b.date, COALESCE(g.grails_eth, 0) AS grails_eth, COALESCE(g.grails_stable, 0) AS grails_stable,
          COALESCE(g.others, 0) AS others
        FROM buckets b LEFT JOIN grouped g ON g.date = b.date
        ORDER BY b.date`,
        params
      ),

      // Weekly renewals, starting 8 weeks before the period for context
      pool.query(
        `WITH ${renewalsCte(`DATE_TRUNC('week', $1::timestamptz - interval '8 weeks')`, '$2::timestamptz')},
        buckets AS (
          SELECT generate_series(
            DATE_TRUNC('week', $1::timestamptz - interval '8 weeks'),
            DATE_TRUNC('week', $2::timestamptz - interval '1 microsecond'),
            '1 week'::interval
          ) AS date
        ),
        grouped AS (
          SELECT
            DATE_TRUNC('week', renewal_date) AS date,
            COUNT(*) FILTER (WHERE ${IS_GRAILS})::int AS grails,
            COUNT(*) FILTER (WHERE NOT ${IS_GRAILS})::int AS others
          FROM ren
          GROUP BY 1
        )
        SELECT b.date, COALESCE(g.grails, 0) AS grails, COALESCE(g.others, 0) AS others
        FROM buckets b LEFT JOIN grouped g ON g.date = b.date
        ORDER BY b.date`,
        params
      ),

      // Renewals per day in this period vs the same-length period just before it
      pool.query(
        `WITH ${renewalsCte('$6::timestamptz', '$2::timestamptz')}
        SELECT
          COUNT(*) FILTER (WHERE renewal_date >= $1::timestamptz AND ${IS_GRAILS})::int AS current_grails,
          COUNT(*) FILTER (WHERE renewal_date >= $1::timestamptz AND NOT ${IS_GRAILS})::int AS current_others,
          COUNT(*) FILTER (WHERE renewal_date < $1::timestamptz AND ${IS_GRAILS})::int AS previous_grails,
          COUNT(*) FILTER (WHERE renewal_date < $1::timestamptz AND NOT ${IS_GRAILS})::int AS previous_others
        FROM ren`,
        [...params, previousFrom.toISOString()]
      ),

      // Wallets with the most Grails renewals
      pool.query(
        `WITH ${renewalsCte('$1::timestamptz', '$2::timestamptz')}
        SELECT
          wallet,
          COUNT(*)::int AS names,
          COUNT(DISTINCT transaction_hash)::int AS txs,
          (percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds) / ${DAY})::float AS median_days,
          COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL)::int AS with_duration,
          COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL AND new_expiry_date < renewal_date)::int AS still_expired,
          BOOL_OR(channel = 'grails_eth') AS paid_eth,
          BOOL_OR(channel = 'grails_stable') AS paid_stable
        FROM ren
        WHERE ${IS_GRAILS}
        GROUP BY wallet
        ORDER BY names DESC
        LIMIT 10`,
        params
      ),
    ])

    const periodDays = periodMs / 1000 / DAY
    const cmp = comparison.rows[0]

    return NextResponse.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        bucket,
        routerError,
        routerTxCount: routerHashes.length,
        measures: {
          renewals: toMeasures(renewalMeasures.rows[0]),
          registrations: toMeasures(registrationMeasures.rows[0]),
        },
        renewalChannels: renewalChannels.rows,
        registrationChannels: registrationChannels.rows,
        series: series.rows.map((r) => ({
          ...r,
          date: (r.date as Date).toISOString(),
        })),
        weekly: weekly.rows.map((r) => ({
          ...r,
          date: (r.date as Date).toISOString(),
        })),
        comparison: {
          periodDays,
          current: {
            grailsPerDay: cmp.current_grails / periodDays,
            othersPerDay: cmp.current_others / periodDays,
          },
          previous: {
            from: previousFrom.toISOString(),
            grailsPerDay: cmp.previous_grails / periodDays,
            othersPerDay: cmp.previous_others / periodDays,
          },
        },
        topRenewers: topRenewers.rows,
      },
    })
  } catch (error) {
    console.error('Market share analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch market share data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
