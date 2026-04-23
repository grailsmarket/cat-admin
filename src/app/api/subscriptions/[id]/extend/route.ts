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

    const body = await request.json().catch(() => null)
    const expiresAtRaw: unknown = body?.expiresAt
    if (typeof expiresAtRaw !== 'string') {
      return NextResponse.json({ error: 'Missing expiresAt (ISO timestamp)' }, { status: 400 })
    }
    const expiresAt = new Date(expiresAtRaw)
    if (isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: 'Invalid expiresAt date' }, { status: 400 })
    }
    if (expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 })
    }

    const result = await withActorTransaction(address, async (client) => {
      const existing = await client.query(
        `SELECT id, user_id, status, tier_id, expires_at
         FROM user_subscriptions WHERE id = $1 FOR UPDATE`,
        [id]
      )
      if (existing.rowCount === 0) return { ok: false as const, code: 404, error: 'Subscription not found' }
      const row = existing.rows[0]

      await client.query(
        `UPDATE user_subscriptions
         SET expires_at = $2,
             status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
             notes = COALESCE(notes || E'\\n', '') || $3,
             updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          expiresAt.toISOString(),
          `[${new Date().toISOString()}] extended to ${expiresAt.toISOString()} by admin ${address}`,
        ]
      )

      // If users.tier_expires_at was tracking this row's old expires_at at this
      // tier, mirror the new value.
      await client.query(
        `UPDATE users u
         SET tier_expires_at = $3::timestamptz
         WHERE u.id = $1
           AND u.tier_id = $2
           AND (
             (u.tier_expires_at IS NULL AND $4::timestamptz IS NULL)
             OR u.tier_expires_at = $4::timestamptz
           )`,
        [row.user_id, row.tier_id, expiresAt.toISOString(), row.expires_at]
      )

      return { ok: true as const, expiresAt: expiresAt.toISOString() }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code })
    }
    return NextResponse.json({ success: true, data: { expiresAt: result.expiresAt } })
  } catch (error) {
    console.error('Extend subscription error:', error)
    return NextResponse.json(
      {
        error: 'Failed to extend subscription',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
