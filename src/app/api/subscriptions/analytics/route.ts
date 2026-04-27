import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { flattenGatedRoutes } from '@/config/tierGatedRoutes'

/**
 * Build the OR-expression matching any tier-gated route in the config, and
 * return the SQL fragment plus the params to append.
 *
 * Returns a SQL fragment like:
 *   (
 *     (l.route = $5 AND l.method = $6) OR
 *     (l.route LIKE $7) OR
 *     ...
 *   )
 * The caller passes `startIdx` — the next placeholder index to use — and we
 * return the list of param values in order.
 */
function buildGatedRouteClause(startIdx: number): { sql: string; params: string[]; nextIdx: number } {
  const routes = flattenGatedRoutes()
  const clauses: string[] = []
  const params: string[] = []
  let idx = startIdx

  for (const r of routes) {
    const parts: string[] = []
    if (r.isPrefix) {
      parts.push(`l.route LIKE $${idx}`)
      params.push(`${r.pattern}/%`)
      idx += 1
    } else {
      parts.push(`l.route = $${idx}`)
      params.push(r.pattern)
      idx += 1
    }
    if (r.method) {
      parts.push(`l.method = $${idx}`)
      params.push(r.method)
      idx += 1
    }
    clauses.push(`(${parts.join(' AND ')})`)
  }

  if (clauses.length === 0) {
    // No gated routes configured — force an impossible match so the result set is empty
    return { sql: 'FALSE', params: [], nextIdx: startIdx }
  }
  return { sql: `(${clauses.join(' OR ')})`, params, nextIdx: idx }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = request.nextUrl.searchParams
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const userParam = searchParams.get('user')

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

    /**
     * Base join: api_request_logs l JOIN user_subscriptions s
     *  - matches rows where the caller held a Plus+ subscription at the time of the request
     *  - filters by tier-gated route patterns from the config
     *
     * Plus+ at time of request means:
     *  - s.tier_id >= 1
     *  - l.created_at >= s.started_at
     *  - (s.expires_at IS NULL OR l.created_at < s.expires_at)
     *  - (s.cancelled_at IS NULL OR l.created_at < s.cancelled_at)
     *
     * We pick the highest-tier matching subscription per log row via DISTINCT ON, so a user
     * who upgraded mid-window reports correctly.
     */

    const baseParams: unknown[] = [fromDate.toISOString(), toDate.toISOString()]
    // $1 = from, $2 = to. Next placeholder is 3.
    const gated = buildGatedRouteClause(3)
    baseParams.push(...gated.params)

    const filteredCTE = `
      WITH filtered AS (
        SELECT DISTINCT ON (l.id)
          l.id,
          l.created_at,
          l.route,
          l.method,
          l.user_id,
          l.address,
          s.tier_id AS caller_tier_id
        FROM api_request_logs l
        JOIN user_subscriptions s
          ON s.user_id = l.user_id
         AND s.tier_id >= 1
         AND l.created_at >= s.started_at
         AND (s.expires_at IS NULL OR l.created_at < s.expires_at)
         AND (s.cancelled_at IS NULL OR l.created_at < s.cancelled_at)
        WHERE l.created_at >= $1::timestamptz
          AND l.created_at < $2::timestamptz
          AND ${gated.sql}
        ORDER BY l.id, s.tier_id DESC
      )
    `

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
        SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*) AS total
        FROM filtered
        GROUP BY DATE_TRUNC('day', created_at)
      )
      SELECT ts.date, COALESCE(g.total, 0)::int AS total
      FROM time_series ts
      LEFT JOIN grouped g ON ts.date = g.date
      ORDER BY ts.date ASC`

    const topRoutesQuery = `
      ${filteredCTE}
      SELECT
        route,
        COUNT(*)::int AS request_count,
        COUNT(DISTINCT user_id)::int AS unique_users
      FROM filtered
      GROUP BY route
      ORDER BY request_count DESC
      LIMIT 50`

    const topUsersQuery = `
      ${filteredCTE}
      SELECT
        address,
        user_id,
        MAX(caller_tier_id)::int AS max_tier_id,
        COUNT(*)::int AS request_count,
        COUNT(DISTINCT route)::int AS unique_routes
      FROM filtered
      GROUP BY address, user_id
      ORDER BY request_count DESC
      LIMIT 50`

    const summaryQuery = `
      ${filteredCTE}
      SELECT
        COUNT(*)::int AS total_requests,
        COUNT(DISTINCT address)::int AS unique_users,
        COUNT(DISTINCT route)::int AS unique_routes
      FROM filtered`

    const [dailyResult, topRoutesResult, topUsersResult, summaryResult] = await Promise.all([
      pool.query(dailyQuery, baseParams),
      pool.query(topRoutesQuery, baseParams),
      pool.query(topUsersQuery, baseParams),
      pool.query(summaryQuery, baseParams),
    ])

    const daily = dailyResult.rows.map((row: Record<string, unknown>) => ({
      date: (row.date as Date).toISOString(),
      total: row.total as number,
    }))

    const topRoutes = topRoutesResult.rows.map((row: Record<string, unknown>) => ({
      route: row.route as string,
      requestCount: row.request_count as number,
      uniqueUsers: row.unique_users as number,
    }))

    const topUsers = topUsersResult.rows.map((row: Record<string, unknown>) => ({
      address: row.address as string,
      userId: row.user_id as number,
      maxTierId: row.max_tier_id as number,
      requestCount: row.request_count as number,
      uniqueRoutes: row.unique_routes as number,
    }))

    const summaryRow = (summaryResult.rows[0] as Record<string, unknown>) || {}
    const summary = {
      totalRequests: (summaryRow.total_requests as number) || 0,
      uniqueUsers: (summaryRow.unique_users as number) || 0,
      uniqueRoutes: (summaryRow.unique_routes as number) || 0,
    }

    let userDrilldown: {
      address: string
      routes: Array<{ route: string; requestCount: number }>
      daily: Array<{ date: string; total: number }>
    } | undefined

    if (userParam) {
      // Append the user address placeholder after the gated-route params
      const userIdx = gated.nextIdx
      const userParams = [...baseParams, userParam]

      const userRoutesQuery = `
        ${filteredCTE}
        SELECT route, COUNT(*)::int AS request_count
        FROM filtered
        WHERE LOWER(address) = LOWER($${userIdx})
        GROUP BY route
        ORDER BY request_count DESC`

      const userDailyQuery = `
        ${filteredCTE},
        time_series AS (
          SELECT generate_series(
            DATE_TRUNC('day', $1::timestamptz),
            DATE_TRUNC('day', $2::timestamptz),
            '1 day'::interval
          ) AS date
        ),
        user_grouped AS (
          SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*) AS total
          FROM filtered
          WHERE LOWER(address) = LOWER($${userIdx})
          GROUP BY DATE_TRUNC('day', created_at)
        )
        SELECT ts.date, COALESCE(ug.total, 0)::int AS total
        FROM time_series ts
        LEFT JOIN user_grouped ug ON ts.date = ug.date
        ORDER BY ts.date ASC`

      const [userRoutesResult, userDailyResult] = await Promise.all([
        pool.query(userRoutesQuery, userParams),
        pool.query(userDailyQuery, userParams),
      ])

      userDrilldown = {
        address: userParam,
        routes: userRoutesResult.rows.map((row: Record<string, unknown>) => ({
          route: row.route as string,
          requestCount: row.request_count as number,
        })),
        daily: userDailyResult.rows.map((row: Record<string, unknown>) => ({
          date: (row.date as Date).toISOString(),
          total: row.total as number,
        })),
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        summary,
        daily,
        topRoutes,
        topUsers,
        ...(userDrilldown ? { userDrilldown } : {}),
      },
    })
  } catch (error) {
    console.error('Subscriber analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch subscriber analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
