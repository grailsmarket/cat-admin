import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { normalizeEnsName } from '@/lib/normalize'

type RouteParams = {
  params: Promise<{ name: string }>
}

// GET /api/cats/[name]/invalid-names - Scan category for invalid ENS names
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { name: categoryName } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify category exists
    const [category] = await query<{ name: string; member_count: number }>(`
      SELECT name, member_count FROM clubs WHERE name = $1
    `, [categoryName])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Fetch all names in the category
    const memberships = await query<{ ens_name: string; added_at: string }>(`
      SELECT ens_name, added_at 
      FROM club_memberships 
      WHERE club_name = $1
      ORDER BY ens_name
    `, [categoryName])

    // Check each name for validity
    const invalidNames: { name: string; reason: string; added_at: string }[] = []

    for (const membership of memberships) {
      const name = membership.ens_name
      
      // Try to normalize - if it fails, it's invalid
      const normalized = normalizeEnsName(name)
      
      if (!normalized) {
        invalidNames.push({
          name,
          reason: 'Failed ENS normalization',
          added_at: membership.added_at,
        })
        continue
      }

      // Check for .eth names that are too short (< 3 chars before .eth)
      if (name.endsWith('.eth')) {
        const label = name.slice(0, -4) // Remove .eth
        if (label.length < 3) {
          invalidNames.push({
            name,
            reason: `Too short (${label.length} chars, minimum is 3)`,
            added_at: membership.added_at,
          })
          continue
        }
      }
    }

    console.log(`[invalid-names] Scanned ${memberships.length} names in "${categoryName}", found ${invalidNames.length} invalid`)

    return NextResponse.json({
      success: true,
      category: categoryName,
      totalScanned: memberships.length,
      invalidCount: invalidNames.length,
      invalidNames,
    })
  } catch (error) {
    console.error('Scan invalid names error:', error)
    return NextResponse.json({ error: 'Failed to scan for invalid names' }, { status: 500 })
  }
}

