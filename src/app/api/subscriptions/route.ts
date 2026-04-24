import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { TIER_ID_TO_DB_NAME, type TierId } from '@/lib/tiers'

const VALID_SORTS = new Set(['expires_at', 'started_at', 'tier_id', 'created_at', 'updated_at'])
const VALID_STATUSES = new Set(['active', 'expired', 'cancelled', 'superseded'])
const VALID_TIER_IDS = new Set<number>([1, 2, 3])
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

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

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { isAdmin, address: adminAddress } = await verifyAdmin(token)
    if (!isAdmin || !adminAddress) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const targetAddress = typeof body.address === 'string' ? body.address.trim() : ''
    const tierIdRaw = typeof body.tierId === 'number' ? body.tierId : NaN
    const expiresAtRaw = typeof body.expiresAt === 'string' ? body.expiresAt : ''
    const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : ''

    if (!ADDRESS_RE.test(targetAddress)) {
      return NextResponse.json({ error: 'address must be a 0x-prefixed 20-byte hex string' }, { status: 400 })
    }
    if (!VALID_TIER_IDS.has(tierIdRaw)) {
      return NextResponse.json({ error: 'tierId must be 1 (Plus), 2 (Pro), or 3 (Gold)' }, { status: 400 })
    }
    const tierId = tierIdRaw as TierId
    const expiresAt = new Date(expiresAtRaw)
    if (isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: 'expiresAt must be an ISO timestamp' }, { status: 400 })
    }
    if (expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 })
    }

    const tierName = TIER_ID_TO_DB_NAME[tierId]
    const noteLine = `[${new Date().toISOString()}] granted ${tierName} until ${expiresAt.toISOString()} by admin ${adminAddress}${notesRaw ? ` — ${notesRaw}` : ''}`

    const result = await withActorTransaction(adminAddress, async (client) => {
      const targetUser = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(address) = LOWER($1) LIMIT 1`,
        [targetAddress]
      )
      if (targetUser.rowCount === 0) {
        return {
          ok: false as const,
          code: 404,
          error: 'No user found for that address. The user needs to sign in at least once before receiving a grant.',
        }
      }
      const targetUserId = targetUser.rows[0].id

      const adminUser = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(address) = LOWER($1) LIMIT 1`,
        [adminAddress]
      )
      const adminUserId: number | null = (adminUser.rowCount ?? 0) > 0 ? adminUser.rows[0].id : null

      // Supersede any currently-active sub for this user so we don't have two
      // 'active' rows at once.
      await client.query(
        `UPDATE user_subscriptions
         SET status = 'superseded',
             cancelled_at = NOW(),
             notes = COALESCE(notes || E'\\n', '') || $2,
             updated_at = NOW()
         WHERE user_id = $1 AND status = 'active'`,
        [targetUserId, `[${new Date().toISOString()}] superseded by admin grant from ${adminAddress}`]
      )

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO user_subscriptions
           (user_id, tier, tier_id, status, started_at, expires_at,
            payment_method, granted_by, notes)
         VALUES ($1, $2, $3, 'active', NOW(), $4, 'admin_grant', $5, $6)
         RETURNING id`,
        [targetUserId, tierName, tierId, expiresAt.toISOString(), adminUserId, noteLine]
      )

      // Mirror to users denorm fields so JWT lookups reflect the new tier.
      await client.query(
        `UPDATE users
         SET tier = $2,
             tier_id = $3,
             tier_expires_at = $4::timestamptz
         WHERE id = $1`,
        [targetUserId, tierName, tierId, expiresAt.toISOString()]
      )

      return {
        ok: true as const,
        id: inserted.rows[0].id,
        userId: targetUserId,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code })
    }
    return NextResponse.json({
      success: true,
      data: { id: result.id, userId: result.userId },
    })
  } catch (error) {
    console.error('Grant subscription error:', error)
    return NextResponse.json(
      {
        error: 'Failed to grant subscription',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
