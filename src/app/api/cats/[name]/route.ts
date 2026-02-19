import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { validateClassifications } from '@/constants/classifications'
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

    // Get pagination params with safe limits
    const url = new URL(request.url)
    const MAX_LIMIT = 100
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1)
    const requestedLimit = parseInt(url.searchParams.get('limit') || '50') || 50
    const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT)
    const offset = (page - 1) * limit

    const [category] = await query<Category>(`
      SELECT name, display_name, description, member_count AS name_count,
        COALESCE(classifications, ARRAY[]::TEXT[]) AS classifications,
        avatar_image_key, header_image_key, created_at, updated_at
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
        display_name: category.display_name || null,
        description: category.description,
        name_count: nameCount,
        classifications: category.classifications || [],
        avatar_image_key: category.avatar_image_key,
        header_image_key: category.header_image_key,
        avatar_url: category.avatar_image_key ? `/api/cats/${category.name}/images?type=avatar` : null,
        header_url: category.header_image_key ? `/api/cats/${category.name}/images?type=header` : null,
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
    const { description, display_name: displayName, classifications: rawClassifications } = body

    if (description && description.length > 500) {
      return NextResponse.json({ error: 'Description must be 500 characters or less' }, { status: 400 })
    }

    if (displayName && displayName.length > 100) {
      return NextResponse.json({ error: 'Display name must be 100 characters or less' }, { status: 400 })
    }

    const classifications = rawClassifications !== undefined
      ? (Array.isArray(rawClassifications) ? validateClassifications(rawClassifications) : [])
      : undefined

    // Check if category exists
    const [existing] = await query<Category>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (!existing) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Update category with actor tracking for audit log
    const updated = await withActorTransaction(address, async (client) => {
      // Build dynamic update based on what was provided
      const setClauses: string[] = ['updated_at = NOW()']
      const values: (string | string[] | null)[] = [name]
      let paramIndex = 2

      if (description !== undefined) {
        setClauses.push(`description = $${paramIndex}`)
        values.push(description || null)
        paramIndex++
      }

      if (displayName !== undefined) {
        setClauses.push(`display_name = $${paramIndex}`)
        values.push(displayName || null)
        paramIndex++
      }

      if (classifications !== undefined) {
        setClauses.push(`classifications = $${paramIndex}`)
        values.push(classifications.length > 0 ? classifications : null)
        paramIndex++
      }

      const result = await client.query(`
        UPDATE clubs
        SET ${setClauses.join(', ')}
        WHERE name = $1
        RETURNING name, display_name, description, member_count AS name_count,
          COALESCE(classifications, ARRAY[]::TEXT[]) AS classifications,
          avatar_image_key, header_image_key, created_at, updated_at
      `, values)
      return result.rows[0] as Category
    })

    console.log(`[cats] Updated category: ${name} by ${address}`)

    const responseData = {
      ...updated,
      avatar_url: updated.avatar_image_key ? `/api/cats/${name}/images?type=avatar` : null,
      header_url: updated.header_image_key ? `/api/cats/${name}/images?type=header` : null,
    }

    return NextResponse.json({ success: true, data: responseData })
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
