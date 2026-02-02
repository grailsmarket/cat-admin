import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'

type RouteParams = {
  params: Promise<{ name: string }>
}

// POST /api/cats/[name]/members - Add members (bulk)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { names } = body // Array of ENS names

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'Names array is required' }, { status: 400 })
    }

    // Normalize ENS names (lowercase, trim)
    const normalizedNames = names
      .map((n: string) => n.trim().toLowerCase())
      .filter((n: string) => n.length > 0)

    if (normalizedNames.length === 0) {
      return NextResponse.json({ error: 'No valid names provided' }, { status: 400 })
    }

    // Check if category exists
    const [category] = await query<{ name: string }>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Validate ENS names exist in ens_names table
    const placeholders = normalizedNames.map((_, i) => `$${i + 1}`).join(', ')
    const validNames = await query<{ name: string }>(`
      SELECT name FROM ens_names WHERE name IN (${placeholders})
    `, normalizedNames)

    const validNameSet = new Set(validNames.map((v) => v.name))
    const invalidNames = normalizedNames.filter((n) => !validNameSet.has(n))

    if (invalidNames.length > 0) {
      return NextResponse.json({
        error: 'Some ENS names are not valid or not found',
        invalidNames,
      }, { status: 400 })
    }

    // Check for existing memberships
    const existingMemberships = await query<{ ens_name: string }>(`
      SELECT ens_name FROM club_memberships 
      WHERE club_name = $1 AND ens_name IN (${placeholders})
    `, [name, ...normalizedNames])

    const existingSet = new Set(existingMemberships.map((e) => e.ens_name))
    const newNames = normalizedNames.filter((n) => !existingSet.has(n))

    if (newNames.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All names already exist in this category',
        added: 0,
        skipped: normalizedNames.length,
      })
    }

    // Add members in a transaction
    const result = await withTransaction(async (client) => {
      // Insert new memberships
      for (const ensName of newNames) {
        await client.query(`
          INSERT INTO club_memberships (club_name, ens_name, created_at)
          VALUES ($1, $2, NOW())
        `, [name, ensName])
      }

      // Update member count
      await client.query(`
        UPDATE clubs 
        SET member_count = (
          SELECT COUNT(*) FROM club_memberships WHERE club_name = $1
        ), updated_at = NOW()
        WHERE name = $1
      `, [name])

      return { added: newNames.length }
    })

    console.log(`[cats] Added ${result.added} members to category: ${name}`)

    return NextResponse.json({
      success: true,
      message: `Added ${result.added} members`,
      added: result.added,
      skipped: existingSet.size,
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

// DELETE /api/cats/[name]/members - Remove members
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { names } = body // Array of ENS names to remove

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'Names array is required' }, { status: 400 })
    }

    // Normalize ENS names
    const normalizedNames = names
      .map((n: string) => n.trim().toLowerCase())
      .filter((n: string) => n.length > 0)

    if (normalizedNames.length === 0) {
      return NextResponse.json({ error: 'No valid names provided' }, { status: 400 })
    }

    // Check if category exists
    const [category] = await query<{ name: string }>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Remove members in a transaction
    const result = await withTransaction(async (client) => {
      // Delete memberships
      const placeholders = normalizedNames.map((_, i) => `$${i + 2}`).join(', ')
      const deleteResult = await client.query(`
        DELETE FROM club_memberships 
        WHERE club_name = $1 AND ens_name IN (${placeholders})
      `, [name, ...normalizedNames])

      // Update member count
      await client.query(`
        UPDATE clubs 
        SET member_count = (
          SELECT COUNT(*) FROM club_memberships WHERE club_name = $1
        ), updated_at = NOW()
        WHERE name = $1
      `, [name])

      return { removed: deleteResult.rowCount || 0 }
    })

    console.log(`[cats] Removed ${result.removed} members from category: ${name}`)

    return NextResponse.json({
      success: true,
      message: `Removed ${result.removed} members`,
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

