import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { normalizeEnsName } from '@/lib/normalize'

type RouteParams = {
  params: Promise<{ name: string }>
}

// POST /api/cats/[name]/members - Add names (bulk, with audit logging)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
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
    const { names } = body // Array of ENS names

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'Names array is required' }, { status: 400 })
    }

    // Limit bulk operations to prevent resource exhaustion
    const MAX_NAMES_PER_REQUEST = 1000
    if (names.length > MAX_NAMES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_NAMES_PER_REQUEST} names per request` },
        { status: 400 }
      )
    }

    // Normalize ENS names per ENSIP-15
    const normalizationResults = names.map((n: string) => ({
      original: n,
      normalized: normalizeEnsName(n),
    }))

    const invalidEnsNames = normalizationResults
      .filter((r) => r.normalized === null)
      .map((r) => r.original)

    const normalizedNames = normalizationResults
      .map((r) => r.normalized)
      .filter((n): n is string => n !== null)

    if (normalizedNames.length === 0) {
      return NextResponse.json({ 
        error: 'No valid ENS names provided',
        invalidNames: invalidEnsNames,
      }, { status: 400 })
    }

    // Check if category exists
    const [category] = await query<{ name: string }>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Validate ENS names exist in ens_names table (case-insensitive)
    const placeholders = normalizedNames.map((_, i) => `$${i + 1}`).join(', ')
    const validNames = await query<{ name: string }>(`
      SELECT name FROM ens_names WHERE LOWER(name) IN (${placeholders})
    `, normalizedNames.map(n => n.toLowerCase()))

    const validNameSet = new Set(validNames.map((v) => v.name.toLowerCase()))
    const notFoundNames = normalizedNames.filter((n) => !validNameSet.has(n.toLowerCase()))

    // Combine invalid names from normalization + not found in DB
    const allInvalidNames = [...invalidEnsNames, ...notFoundNames]

    if (allInvalidNames.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Some ENS names are invalid or not found in database',
        invalidNames: allInvalidNames,
        details: {
          invalidFormat: invalidEnsNames,
          notInDatabase: notFoundNames,
        }
      }, { status: 400 })
    }

    // Use the actual names from DB (correct casing)
    const dbNames = validNames.map(v => v.name)

    // Add names in a transaction with actor tracking for audit log
    const result = await withActorTransaction(address, async (client) => {
      let added = 0
      let skipped = 0

      for (const ensName of dbNames) {
        // Use ON CONFLICT DO NOTHING with RETURNING to know if insert happened
        const insertResult = await client.query(`
          INSERT INTO club_memberships (club_name, ens_name, added_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (club_name, ens_name) DO NOTHING
          RETURNING club_name
        `, [name, ensName])

        if (insertResult.rowCount && insertResult.rowCount > 0) {
          added++
        } else {
          skipped++
        }
      }

      // Note: member_count is updated automatically by trigger (update_club_member_count)

      return { added, skipped }
    })

    console.log(`[cats] Added ${result.added} names to category: ${name} by ${address} (skipped ${result.skipped} existing)`)

    return NextResponse.json({
      success: true,
      message: `Added ${result.added} member(s)`,
      added: result.added,
      skipped: result.skipped,
    })
  } catch (error) {
    console.error('Add members error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to add members' }, { status: 500 })
  }
}

// DELETE /api/cats/[name]/members - Remove names (with audit logging)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
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
    const { names } = body // Array of ENS names to remove

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'Names array is required' }, { status: 400 })
    }

    // Limit bulk operations to prevent resource exhaustion
    const MAX_NAMES_PER_REQUEST = 1000
    if (names.length > MAX_NAMES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_NAMES_PER_REQUEST} names per request` },
        { status: 400 }
      )
    }

    // Normalize ENS names per ENSIP-15
    const normalizedNames = names
      .map((n: string) => normalizeEnsName(n))
      .filter((n): n is string => n !== null)

    if (normalizedNames.length === 0) {
      return NextResponse.json({ error: 'No valid ENS names provided' }, { status: 400 })
    }

    // Check if category exists
    const [category] = await query<{ name: string }>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Remove names in a transaction with actor tracking for audit log
    const result = await withActorTransaction(address, async (client) => {
      let removed = 0

      for (const ensName of normalizedNames) {
        // Case-insensitive delete with RETURNING to count actual deletions
        const deleteResult = await client.query(`
          DELETE FROM club_memberships 
          WHERE club_name = $1 AND LOWER(ens_name) = LOWER($2)
          RETURNING club_name
        `, [name, ensName])

        if (deleteResult.rowCount && deleteResult.rowCount > 0) {
          removed++
        }
      }

      // Note: member_count is updated automatically by trigger (update_club_member_count)

      return { removed }
    })

    console.log(`[cats] Removed ${result.removed} names from category: ${name} by ${address}`)

    return NextResponse.json({
      success: true,
      message: `Removed ${result.removed} member(s)`,
      removed: result.removed,
    })
  } catch (error) {
    console.error('Remove members error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to remove members' }, { status: 500 })
  }
}
