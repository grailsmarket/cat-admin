import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import type { AuditLogEntry } from '@/types'

// GET /api/activity - Get audit log entries
export async function GET(request: NextRequest) {
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

    // Get query params
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    const tableFilter = url.searchParams.get('table') // 'clubs' or 'club_memberships'
    const operationFilter = url.searchParams.get('operation') // 'INSERT', 'UPDATE', 'DELETE'
    const actorFilter = url.searchParams.get('actor') // wallet address
    const hideSystem = url.searchParams.get('hideSystem') === 'true' // hide entries with no actor

    // Build query with optional filters
    let whereClause = ''
    const params: unknown[] = []
    let paramIndex = 1

    const conditions: string[] = []
    
    // Filter out system/worker updates (no actor_address) if requested
    if (hideSystem) {
      conditions.push('actor_address IS NOT NULL')
    }
    
    if (tableFilter) {
      conditions.push(`table_name = $${paramIndex++}`)
      params.push(tableFilter)
    }
    if (operationFilter) {
      conditions.push(`operation = $${paramIndex++}`)
      params.push(operationFilter)
    }
    if (actorFilter) {
      conditions.push(`LOWER(actor_address) = LOWER($${paramIndex++})`)
      params.push(actorFilter)
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ')
    }

    // Get total count
    const [countResult] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM clubs_audit_log ${whereClause}`,
      params
    )
    const totalCount = parseInt(countResult?.count || '0')

    // Get paginated entries
    const entries = await query<AuditLogEntry>(
      `SELECT id, table_name, operation, record_key, old_data, new_data, actor_address, db_user, created_at
       FROM clubs_audit_log
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: {
        entries,
        pagination: {
          page,
          limit,
          totalEntries: totalCount,
          totalPages: Math.ceil(totalCount / limit) || 1,
        },
      },
    })
  } catch (error) {
    console.error('Get activity error:', error)

    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({
        error: 'Database not configured. Set DATABASE_URL environment variable.',
      }, { status: 503 })
    }

    // Handle permission denied error gracefully
    if (error instanceof Error && error.message.includes('permission denied')) {
      return NextResponse.json({
        error: 'Permission denied. SELECT access on clubs_audit_log not granted yet.',
      }, { status: 403 })
    }

    return NextResponse.json({ error: 'Failed to get activity log' }, { status: 500 })
  }
}

