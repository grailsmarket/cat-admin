import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'

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
    const dateParams = [fromDate.toISOString(), toDate.toISOString()]

    const dailyQuery = `
      WITH time_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', $1::timestamptz),
          DATE_TRUNC('day', $2::timestamptz),
          '1 day'::interval
        ) AS date
      ),
      grouped AS (
        SELECT
          DATE_TRUNC('day', created_at) AS date,
          COUNT(*) AS total
        FROM api_request_logs
        WHERE created_at >= $1::timestamptz
          AND created_at < $2::timestamptz
        GROUP BY DATE_TRUNC('day', created_at)
      )
      SELECT
        ts.date,
        COALESCE(g.total, 0)::int AS total
      FROM time_series ts
      LEFT JOIN grouped g ON ts.date = g.date
      ORDER BY ts.date ASC`

    const topRoutesQuery = `
      SELECT
        route,
        COUNT(*)::int AS request_count,
        COUNT(DISTINCT user_id)::int AS unique_users
      FROM api_request_logs
      WHERE created_at >= $1::timestamptz
        AND created_at < $2::timestamptz
      GROUP BY route
      ORDER BY request_count DESC
      LIMIT 50`

    const topUsersQuery = `
      SELECT
        address,
        user_id,
        COUNT(*)::int AS request_count,
        COUNT(DISTINCT route)::int AS unique_routes
      FROM api_request_logs
      WHERE created_at >= $1::timestamptz
        AND created_at < $2::timestamptz
      GROUP BY address, user_id
      ORDER BY request_count DESC
      LIMIT 50`

    const summaryQuery = `
      SELECT
        COUNT(*)::int AS total_requests,
        COUNT(DISTINCT address)::int AS unique_users,
        COUNT(DISTINCT route)::int AS unique_routes
      FROM api_request_logs
      WHERE created_at >= $1::timestamptz
        AND created_at < $2::timestamptz`

    const [dailyResult, topRoutesResult, topUsersResult, summaryResult] = await Promise.all([
      pool.query(dailyQuery, dateParams),
      pool.query(topRoutesQuery, dateParams),
      pool.query(topUsersQuery, dateParams),
      pool.query(summaryQuery, dateParams),
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
      requestCount: row.request_count as number,
      uniqueRoutes: row.unique_routes as number,
    }))

    const summaryRow = summaryResult.rows[0] as Record<string, unknown>
    const summary = {
      totalRequests: (summaryRow.total_requests as number) || 0,
      uniqueUsers: (summaryRow.unique_users as number) || 0,
      uniqueRoutes: (summaryRow.unique_routes as number) || 0,
    }

    // User drill-down (only when user param is provided)
    let userDrilldown: {
      address: string
      routes: Array<{ route: string; requestCount: number }>
      daily: Array<{ date: string; total: number }>
    } | undefined

    if (userParam) {
      const userRoutesQuery = `
        SELECT
          route,
          COUNT(*)::int AS request_count
        FROM api_request_logs
        WHERE created_at >= $1::timestamptz
          AND created_at < $2::timestamptz
          AND LOWER(address) = LOWER($3)
        GROUP BY route
        ORDER BY request_count DESC`

      const userDailyQuery = `
        WITH time_series AS (
          SELECT generate_series(
            DATE_TRUNC('day', $1::timestamptz),
            DATE_TRUNC('day', $2::timestamptz),
            '1 day'::interval
          ) AS date
        ),
        grouped AS (
          SELECT
            DATE_TRUNC('day', created_at) AS date,
            COUNT(*) AS total
          FROM api_request_logs
          WHERE created_at >= $1::timestamptz
            AND created_at < $2::timestamptz
            AND LOWER(address) = LOWER($3)
          GROUP BY DATE_TRUNC('day', created_at)
        )
        SELECT
          ts.date,
          COALESCE(g.total, 0)::int AS total
        FROM time_series ts
        LEFT JOIN grouped g ON ts.date = g.date
        ORDER BY ts.date ASC`

      const userParams = [fromDate.toISOString(), toDate.toISOString(), userParam]

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
    console.error('Request analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch request analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
