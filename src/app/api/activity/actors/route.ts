import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

// GET /api/activity/actors - Get unique actor addresses from audit log
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get unique actor addresses (non-null only)
    const actors = await query<{ actor_address: string }>(`
      SELECT DISTINCT actor_address 
      FROM clubs_audit_log 
      WHERE actor_address IS NOT NULL
      ORDER BY actor_address
    `)

    return NextResponse.json({
      success: true,
      data: actors.map(a => a.actor_address),
    })
  } catch (error) {
    console.error('Get actors error:', error)

    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({
        error: 'Database not configured. Set DATABASE_URL environment variable.',
      }, { status: 503 })
    }

    if (error instanceof Error && error.message.includes('permission denied')) {
      return NextResponse.json({
        error: 'Permission denied. SELECT access on clubs_audit_log not granted yet.',
      }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to get actors' }, { status: 500 })
  }
}

