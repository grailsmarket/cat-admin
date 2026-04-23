import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

const VALID_SORTS = new Set(['expires_at', 'started_at', 'tier_id', 'created_at', 'updated_at'])
const VALID_STATUSES = new Set(['active', 'expired', 'cancelled', 'superseded'])

export interface SubscriptionRow {
  id: number
  user_id: number
  address: string | null
  tier: string
  tier_id: number
  status: string
  started_at: string
  expires_at: string | null
  cancelled_at: string | null
  payment_method: string | null
  payment_tx_hash: string | null
  payment_amount_wei: string | null
  granted_by_user_id: number | null
  granted_by_address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(request.url)
    const MAX_LIMIT = 100
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1)
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '50') || 50), MAX_LIMIT)
    const offset = (page - 1) * limit

    const search = (url.searchParams.get('search') || '').trim()
    const tierIds = url.searchParams.getAll('tierIds').map((v) => parseInt(v)).filter((n) => !isNaN(n))
    const statuses = url.searchParams.getAll('statuses').filter((s) => VALID_STATUSES.has(s))
    const sortRaw = url.searchParams.get('sort') || 'started_at'
    const sort = VALID_SORTS.has(sortRaw) ? sortRaw : 'started_at'
    const dir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC'

    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (search) {
      // Match address (partial, case-insensitive) or user_id exactly
      const asInt = parseInt(search)
      if (!isNaN(asInt) && String(asInt) === search) {
        conditions.push(`(s.user_id = $${idx} OR LOWER(u.address) LIKE LOWER($${idx + 1}))`)
        params.push(asInt, `%${search}%`)
        idx += 2
      } else {
        conditions.push(`LOWER(u.address) LIKE LOWER($${idx})`)
        params.push(`%${search}%`)
        idx += 1
      }
    }
    if (tierIds.length > 0) {
      conditions.push(`s.tier_id = ANY($${idx}::int[])`)
      params.push(tierIds)
      idx += 1
    }
    if (statuses.length > 0) {
      conditions.push(`s.status = ANY($${idx}::text[])`)
      params.push(statuses)
      idx += 1
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRow] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM user_subscriptions s
       LEFT JOIN users u ON u.id = s.user_id
       ${whereClause}`,
      params
    )
    const totalEntries = parseInt(countRow?.count || '0')

    const entries = await query<SubscriptionRow>(
      `SELECT
        s.id,
        s.user_id,
        u.address,
        s.tier,
        s.tier_id,
        s.status,
        s.started_at,
        s.expires_at,
        s.cancelled_at,
        s.payment_method,
        s.payment_tx_hash,
        s.payment_amount_wei,
        s.granted_by AS granted_by_user_id,
        gu.address AS granted_by_address,
        s.notes,
        s.created_at,
        s.updated_at
       FROM user_subscriptions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN users gu ON gu.id = s.granted_by
       ${whereClause}
       ORDER BY s.${sort} ${dir} NULLS LAST, s.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: {
        entries,
        pagination: {
          page,
          limit,
          totalEntries,
          totalPages: Math.ceil(totalEntries / limit) || 1,
        },
      },
    })
  } catch (error) {
    console.error('List subscriptions error:', error)
    return NextResponse.json(
      {
        error: 'Failed to list subscriptions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
