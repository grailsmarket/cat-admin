import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { normalizeEnsName } from '@/lib/normalize'

type RouteParams = {
  params: Promise<{ name: string }>
}

// DELETE /api/names/[name]/categories - Remove categories from an ENS name (with audit logging)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name: rawName } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin, address } = await verifyAdmin(token)
    if (!isAdmin || !address) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { categories } = body // Array of category names to remove

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: 'Categories array is required' }, { status: 400 })
    }

    // Normalize the ENS name
    const normalizedName = normalizeEnsName(rawName)
    if (!normalizedName) {
      return NextResponse.json({ error: 'Invalid ENS name format' }, { status: 400 })
    }

    // Verify ENS name exists (case-insensitive)
    const [ensName] = await query<{ name: string }>(`
      SELECT name FROM ens_names WHERE LOWER(name) = LOWER($1)
    `, [normalizedName])

    if (!ensName) {
      return NextResponse.json({ error: 'ENS name not found' }, { status: 404 })
    }

    // Use the actual name from DB (correct casing)
    const dbName = ensName.name

    // Remove memberships in a transaction with actor tracking for audit log
    const result = await withActorTransaction(address, async (client) => {
      let removed = 0

      for (const categoryName of categories) {
        // Delete membership with RETURNING to count actual deletions
        const deleteResult = await client.query(`
          DELETE FROM club_memberships 
          WHERE LOWER(ens_name) = LOWER($1) AND club_name = $2
          RETURNING club_name
        `, [dbName, categoryName])

        if (deleteResult.rowCount && deleteResult.rowCount > 0) {
          removed++
        }
      }

      // Note: member_count is updated automatically by trigger (update_club_member_count)
      // Note: ens_names.clubs is updated automatically by trigger (sync_clubs_to_ens_names)

      return { removed }
    })

    console.log(`[names] Removed ${result.removed} categories from: ${dbName} by ${address}`)

    return NextResponse.json({
      success: true,
      message: `Removed ${result.removed} category membership(s)`,
      removed: result.removed,
    })
  } catch (error) {
    console.error('Remove categories from name error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to remove categories' }, { status: 500 })
  }
}

