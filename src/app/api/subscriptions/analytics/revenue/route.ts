import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'

const SUBS_LIMIT = 200

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  try {
    const pool = getPool()
    const params = [fromDate.toISOString(), toDate.toISOString()]

    /**
     * "paid" = a subscription row with a non-null, > 0 payment_amount_wei.
     * Excludes admin grants (payment_method='admin_grant', wei is null) and any
     * zero-amount rows. Uses started_at as the bucket date — that's when the
     * subscription began, which matches "when the user subscribed".
     *
     * USD value at sub time = wei->ETH * (most recent price_feeds row at or
     * before started_at). We use a LATERAL join so each sub picks its own price.
     */
    const filteredCTE = `
      WITH filtered AS (
        SELECT
          s.id,
          s.user_id,
          u.address,
          s.tier,
          s.tier_id,
          s.status,
          s.started_at,
          s.expires_at,
          s.payment_method,
          s.payment_tx_hash,
          s.payment_amount_wei,
          (s.payment_amount_wei::numeric / 1e18::numeric) AS eth_amount,
          p.price AS eth_usd_at_sub
        FROM user_subscriptions s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN LATERAL (
          SELECT price
          FROM price_feeds
          WHERE token_symbol = 'ETH'
            AND quote_currency = 'USD'
            AND timestamp <= s.started_at
          ORDER BY timestamp DESC
          LIMIT 1
        ) p ON TRUE
        WHERE s.started_at >= $1::timestamptz
          AND s.started_at < $2::timestamptz
          AND s.payment_amount_wei IS NOT NULL
          AND s.payment_amount_wei::numeric > 0
      )
    `

    const summaryQuery = `
      ${filteredCTE}
      SELECT
        COUNT(*)::int AS total_subs,
        COUNT(DISTINCT user_id)::int AS unique_users,
        COALESCE(SUM(eth_amount), 0)::text AS total_eth,
        COALESCE(SUM(eth_amount * eth_usd_at_sub), 0)::text AS total_usd_historical
      FROM filtered`

    const dailyQuery = `
      ${filteredCTE},
      time_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', $1::timestamptz),
          DATE_TRUNC('day', $2::timestamptz),
          '1 day'::interval
        ) AS date
      ),
      grouped AS (
        SELECT
          DATE_TRUNC('day', started_at) AS date,
          COUNT(*) AS count,
          SUM(eth_amount) AS eth,
          SUM(eth_amount * eth_usd_at_sub) AS usd
        FROM filtered
        GROUP BY DATE_TRUNC('day', started_at)
      )
      SELECT
        ts.date,
        COALESCE(g.count, 0)::int AS count,
        COALESCE(g.eth, 0)::text AS eth,
        COALESCE(g.usd, 0)::text AS usd
      FROM time_series ts
      LEFT JOIN grouped g ON ts.date = g.date
      ORDER BY ts.date ASC`

    const subsQuery = `
      ${filteredCTE}
      SELECT
        id,
        user_id,
        address,
        tier,
        tier_id,
        status,
        started_at,
        expires_at,
        payment_method,
        payment_tx_hash,
        payment_amount_wei,
        eth_amount::text AS eth_amount,
        (eth_amount * eth_usd_at_sub)::text AS usd_amount,
        eth_usd_at_sub::text AS eth_usd_at_sub
      FROM filtered
      ORDER BY started_at DESC
      LIMIT ${SUBS_LIMIT}`

    const currentPriceQuery = `
      SELECT price::text AS price, timestamp
      FROM latest_prices
      WHERE token_symbol = 'ETH' AND quote_currency = 'USD'`

    const [summaryResult, dailyResult, subsResult, currentPriceResult] = await Promise.all([
      pool.query(summaryQuery, params),
      pool.query(dailyQuery, params),
      pool.query(subsQuery, params),
      pool.query(currentPriceQuery),
    ])

    const summaryRow = (summaryResult.rows[0] as Record<string, unknown>) || {}
    const summary = {
      totalSubs: (summaryRow.total_subs as number) || 0,
      uniqueUsers: (summaryRow.unique_users as number) || 0,
      totalEth: parseFloat((summaryRow.total_eth as string) || '0'),
      totalUsdHistorical: parseFloat((summaryRow.total_usd_historical as string) || '0'),
    }

    const daily = dailyResult.rows.map((row: Record<string, unknown>) => ({
      date: (row.date as Date).toISOString(),
      count: row.count as number,
      eth: parseFloat((row.eth as string) || '0'),
      usd: parseFloat((row.usd as string) || '0'),
    }))

    const subs = subsResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id as number,
      userId: row.user_id as number,
      address: (row.address as string) || null,
      tier: row.tier as string,
      tierId: row.tier_id as number,
      status: row.status as string,
      startedAt: (row.started_at as Date).toISOString(),
      expiresAt: row.expires_at ? (row.expires_at as Date).toISOString() : null,
      paymentMethod: (row.payment_method as string) || null,
      paymentTxHash: (row.payment_tx_hash as string) || null,
      paymentAmountWei: (row.payment_amount_wei as string) || null,
      ethAmount: parseFloat((row.eth_amount as string) || '0'),
      usdAmount: row.usd_amount ? parseFloat(row.usd_amount as string) : null,
      ethUsdAtSub: row.eth_usd_at_sub ? parseFloat(row.eth_usd_at_sub as string) : null,
    }))

    const currentPriceRow = (currentPriceResult.rows[0] as Record<string, unknown>) || null
    const currentEthUsd = currentPriceRow ? parseFloat((currentPriceRow.price as string) || '0') : null
    const currentPriceTimestamp = currentPriceRow ? (currentPriceRow.timestamp as Date).toISOString() : null

    return NextResponse.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        summary: {
          ...summary,
          currentEthUsd,
          currentPriceTimestamp,
          totalUsdAtCurrent: currentEthUsd !== null ? summary.totalEth * currentEthUsd : null,
        },
        daily,
        subs,
        subsLimit: SUBS_LIMIT,
        subsTruncated: subs.length === SUBS_LIMIT,
      },
    })
  } catch (error) {
    console.error('Subscription revenue analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch subscription revenue',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
