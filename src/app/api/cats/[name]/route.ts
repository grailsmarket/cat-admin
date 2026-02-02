import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import type { Category, CategoryMember } from '@/types'

type RouteParams = {
  params: Promise<{ name: string }>
}

// GET /api/cats/[name] - Get category details with members
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

    // Get category
    const [category] = await query<Category>(`
      SELECT name, description, member_count, created_at, updated_at
      FROM clubs
      WHERE name = $1
    `, [name])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get members with pagination
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const members = await query<CategoryMember>(`
      SELECT ens_name, added_at
      FROM club_memberships
      WHERE club_name = $1
      ORDER BY ens_name
      LIMIT $2 OFFSET $3
    `, [name, limit, offset])

    // Get total count for pagination
    const [countResult] = await query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM club_memberships
      WHERE club_name = $1
    `, [name])

    const totalMembers = parseInt(countResult?.count || '0')
    const totalPages = Math.ceil(totalMembers / limit)

    return NextResponse.json({
      success: true,
      data: {
        ...category,
        members,
        pagination: {
          page,
          limit,
          totalMembers,
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

// PUT /api/cats/[name] - Update category
export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { description } = body

    // Check if category exists
    const [existing] = await query<Category>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Update category
    const [updated] = await query<Category>(`
      UPDATE clubs
      SET description = $2, updated_at = NOW()
      WHERE name = $1
      RETURNING name, description, member_count, created_at, updated_at
    `, [name, description || null])

    console.log(`[cats] Updated category: ${name}`)

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

