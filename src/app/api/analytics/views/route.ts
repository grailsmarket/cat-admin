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

    // Daily name views
    const nameViewsDailyQuery = `
      WITH time_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', $1::timestamptz),
          DATE_TRUNC('day', $2::timestamptz),
          '1 day'::interval
        ) AS date
      ),
      grouped AS (
        SELECT
          DATE_TRUNC('day', viewed_at) AS date,
          COUNT(*) AS total
        FROM name_views
        WHERE viewed_at >= $1::timestamptz
          AND viewed_at < $2::timestamptz
        GROUP BY DATE_TRUNC('day', viewed_at)
      )
      SELECT
        ts.date,
        COALESCE(g.total, 0)::int AS total
      FROM time_series ts
      LEFT JOIN grouped g ON ts.date = g.date
      ORDER BY ts.date ASC`

    // Daily profile views
    const profileViewsDailyQuery = `
      WITH time_series AS (
        SELECT generate_series(
          DATE_TRUNC('day', $1::timestamptz),
          DATE_TRUNC('day', $2::timestamptz),
          '1 day'::interval
        ) AS date
      ),
      grouped AS (
        SELECT
          DATE_TRUNC('day', viewed_at) AS date,
          COUNT(*) AS total
        FROM profile_views
        WHERE viewed_at >= $1::timestamptz
          AND viewed_at < $2::timestamptz
        GROUP BY DATE_TRUNC('day', viewed_at)
      )
      SELECT
        ts.date,
        COALESCE(g.total, 0)::int AS total
      FROM time_series ts
      LEFT JOIN grouped g ON ts.date = g.date
      ORDER BY ts.date ASC`

    // Top viewed names (join with ens_names to get the name)
    const topNamesQuery = `
      SELECT
        en.name,
        COUNT(*)::int AS view_count,
        COUNT(DISTINCT nv.viewer_identifier)::int AS unique_viewers
      FROM name_views nv
      JOIN ens_names en ON en.id = nv.ens_name_id
      WHERE nv.viewed_at >= $1::timestamptz
        AND nv.viewed_at < $2::timestamptz
      GROUP BY en.name
      ORDER BY view_count DESC
      LIMIT 50`

    // Top viewed profiles
    const topProfilesQuery = `
      SELECT
        profile_address,
        COUNT(*)::int AS view_count,
        COUNT(DISTINCT viewer_identifier)::int AS unique_viewers
      FROM profile_views
      WHERE viewed_at >= $1::timestamptz
        AND viewed_at < $2::timestamptz
      GROUP BY profile_address
      ORDER BY view_count DESC
      LIMIT 50`

    // Summary
    const summaryQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM name_views WHERE viewed_at >= $1::timestamptz AND viewed_at < $2::timestamptz) AS total_name_views,
        (SELECT COUNT(DISTINCT ens_name_id)::int FROM name_views WHERE viewed_at >= $1::timestamptz AND viewed_at < $2::timestamptz) AS unique_names,
        (SELECT COUNT(*)::int FROM profile_views WHERE viewed_at >= $1::timestamptz AND viewed_at < $2::timestamptz) AS total_profile_views,
        (SELECT COUNT(DISTINCT profile_address)::int FROM profile_views WHERE viewed_at >= $1::timestamptz AND viewed_at < $2::timestamptz) AS unique_profiles`

    const [
      nameViewsDailyResult,
      profileViewsDailyResult,
      topNamesResult,
      topProfilesResult,
      summaryResult,
    ] = await Promise.all([
      pool.query(nameViewsDailyQuery, dateParams),
      pool.query(profileViewsDailyQuery, dateParams),
      pool.query(topNamesQuery, dateParams),
      pool.query(topProfilesQuery, dateParams),
      pool.query(summaryQuery, dateParams),
    ])

    const nameViewsDaily = nameViewsDailyResult.rows.map((row: Record<string, unknown>) => ({
      date: (row.date as Date).toISOString(),
      total: row.total as number,
    }))

    const profileViewsDaily = profileViewsDailyResult.rows.map((row: Record<string, unknown>) => ({
      date: (row.date as Date).toISOString(),
      total: row.total as number,
    }))

    const topNames = topNamesResult.rows.map((row: Record<string, unknown>) => ({
      name: row.name as string,
      viewCount: row.view_count as number,
      uniqueViewers: row.unique_viewers as number,
    }))

    const topProfiles = topProfilesResult.rows.map((row: Record<string, unknown>) => ({
      address: row.profile_address as string,
      viewCount: row.view_count as number,
      uniqueViewers: row.unique_viewers as number,
    }))

    const summaryRow = summaryResult.rows[0] as Record<string, unknown>
    const summary = {
      totalNameViews: (summaryRow.total_name_views as number) || 0,
      uniqueNames: (summaryRow.unique_names as number) || 0,
      totalProfileViews: (summaryRow.total_profile_views as number) || 0,
      uniqueProfiles: (summaryRow.unique_profiles as number) || 0,
    }

    return NextResponse.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        summary,
        nameViewsDaily,
        profileViewsDaily,
        topNames,
        topProfiles,
      },
    })
  } catch (error) {
    console.error('Views analytics error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch views analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
