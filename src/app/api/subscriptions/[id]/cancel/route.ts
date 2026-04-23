import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { isAdmin, address } = await verifyAdmin(token)
    if (!isAdmin || !address) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: idRaw } = await context.params
    const id = parseInt(idRaw)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid subscription id' }, { status: 400 })

    const result = await withActorTransaction(address, async (client) => {
      const existing = await client.query(
        `SELECT id, user_id, status, tier, tier_id, expires_at
         FROM user_subscriptions WHERE id = $1 FOR UPDATE`,
        [id]
      )
      if (existing.rowCount === 0) return { ok: false as const, code: 404, error: 'Subscription not found' }
      const row = existing.rows[0]
      if (row.status === 'cancelled') {
        return { ok: false as const, code: 409, error: 'Subscription is already cancelled' }
      }

      await client.query(
        `UPDATE user_subscriptions
         SET status = 'cancelled',
             cancelled_at = NOW(),
             notes = COALESCE(notes || E'\\n', '') || $2,
             updated_at = NOW()
         WHERE id = $1`,
        [id, `[${new Date().toISOString()}] cancelled by admin ${address}`]
      )

      // If this was the user's active sub (reflected on the users table denorm fields),
      // reset users.tier_* to free. We detect "active sub" by matching tier_id and
      // either matching tier_expires_at or a null expires_at.
      await client.query(
        `UPDATE users u
         SET tier = 'free',
             tier_id = 0,
             tier_expires_at = NULL
         WHERE u.id = $1
           AND u.tier_id = $2
           AND (
             (u.tier_expires_at IS NULL AND $3::timestamptz IS NULL)
             OR u.tier_expires_at = $3::timestamptz
           )`,
        [row.user_id, row.tier_id, row.expires_at]
      )

      return { ok: true as const }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cancel subscription error:', error)
    return NextResponse.json(
      {
        error: 'Failed to cancel subscription',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
