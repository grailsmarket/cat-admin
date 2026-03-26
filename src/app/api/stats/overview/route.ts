import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { getPool } from '@/lib/db'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pool = getPool()

    const [usersResult, nameViewsResult, profileViewsResult, apiRequestsResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS last_1d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30d
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '1 day') AS last_1d,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '7 days') AS last_7d,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '30 days') AS last_30d
        FROM name_views
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '1 day') AS last_1d,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '7 days') AS last_7d,
          COUNT(*) FILTER (WHERE viewed_at >= NOW() - INTERVAL '30 days') AS last_30d
        FROM profile_views
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') AS last_1d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS last_7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30d
        FROM api_request_logs
      `),
    ])

    const parseRow = (row: Record<string, string>) => ({
      total: parseInt(row?.total || '0'),
      last1d: parseInt(row?.last_1d || '0'),
      last7d: parseInt(row?.last_7d || '0'),
      last30d: parseInt(row?.last_30d || '0'),
    })

    return NextResponse.json({
      success: true,
      data: {
        users: parseRow(usersResult.rows[0]),
        nameViews: parseRow(nameViewsResult.rows[0]),
        profileViews: parseRow(profileViewsResult.rows[0]),
        apiRequests: parseRow(apiRequestsResult.rows[0]),
      }
    })
  } catch (error) {
    console.error('Overview stats error:', error)
    return NextResponse.json({
      error: 'Failed to fetch overview stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
