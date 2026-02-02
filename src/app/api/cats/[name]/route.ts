import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import type { Category } from '@/types'

type RouteParams = {
  params: Promise<{ name: string }>
}

const GRAILS_API_URL = process.env.GRAILS_API_URL

// GET /api/cats/[name] - Get category details with members (via grails-backend)
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

    if (!GRAILS_API_URL) {
      return NextResponse.json({ error: 'GRAILS_API_URL not configured' }, { status: 503 })
    }

    // Get pagination params
    const url = new URL(request.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    // Fetch from grails-backend /clubs/:name endpoint
    const apiUrl = `${GRAILS_API_URL}/clubs/${encodeURIComponent(name)}?page=${page}&limit=${limit}`
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch category' }, { status: response.status })
    }

    const data = await response.json()

    if (!data.success) {
      return NextResponse.json({ error: data.error || 'Category not found' }, { status: 404 })
    }

    const club = data.data

    // Calculate name count from the names array or fall back to member_count
    const names = club.names || []
    const nameCount = club.member_count ?? names.length

    // Map to our response format
    return NextResponse.json({
      success: true,
      data: {
        name: club.name,
        description: club.description,
        name_count: nameCount,
        created_at: club.created_at,
        updated_at: club.updated_at,
        names: names.map((n: { name: string; added_at?: string }) => ({
          ens_name: n.name,
          added_at: n.added_at || null,
        })),
        pagination: {
          page,
          limit,
          totalNames: nameCount,
          totalPages: Math.ceil(nameCount / limit) || 1,
        },
      },
    })
  } catch (error) {
    console.error('Get category error:', error)
    return NextResponse.json({ error: 'Failed to get category' }, { status: 500 })
  }
}

// PUT /api/cats/[name] - Update category (direct DB - no backend endpoint)
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
