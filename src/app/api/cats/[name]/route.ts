import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import type { Category } from '@/types'

type RouteParams = {
  params: Promise<{ name: string }>
}

type ClubMembership = {
  ens_name: string
  added_at: string
}

// GET /api/cats/[name] - Get category details with names (direct DB)
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Get pagination params
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Get category details
    const [category] = await query<Category>(`
      SELECT name, description, member_count AS name_count, created_at, updated_at
      FROM clubs
      WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get paginated names in this category
    const names = await query<ClubMembership>(`
      SELECT ens_name, added_at
      FROM club_memberships
      WHERE club_name = $1
      ORDER BY added_at DESC
      LIMIT $2 OFFSET $3
    `, [name, limit, offset])

    const nameCount = category.name_count ?? 0
    const totalPages = Math.ceil(nameCount / limit) || 1

    return NextResponse.json({
      success: true,
      data: {
        name: category.name,
        description: category.description,
        name_count: nameCount,
        created_at: category.created_at,
        updated_at: category.updated_at,
        names: names.map((n) => ({
          ens_name: n.ens_name,
          added_at: n.added_at,
        })),
        pagination: {
          page,
          limit,
          totalNames: nameCount,
          totalPages,
        },
      },
    })
  } catch (error) {
    console.error('Get category error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to get category' }, { status: 500 })
  }
}

// PUT /api/cats/[name] - Update category (with audit logging)
export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { description } = body

    // Check if category exists
    const [existing] = await query<Category>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Update category with actor tracking for audit log
    const updated = await withActorTransaction(address, async (client) => {
      const result = await client.query(`
        UPDATE clubs
        SET description = $2, updated_at = NOW()
        WHERE name = $1
        RETURNING name, description, member_count AS name_count, created_at, updated_at
      `, [name, description || null])
      return result.rows[0] as Category
    })

    console.log(`[cats] Updated category: ${name} by ${address}`)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Update category error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}
