import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import type { Category } from '@/types'

// GET /api/cats - List all categories (direct DB)
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Query all categories from database
    const categories = await query<Category>(`
      SELECT 
        name, 
        description, 
        member_count AS name_count, 
        created_at, 
        updated_at
      FROM clubs
      ORDER BY name ASC
    `)

    return NextResponse.json({ success: true, data: categories })
  } catch (error) {
    console.error('List categories error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to list categories' }, { status: 500 })
  }
}

// POST /api/cats - Create category (direct DB - no backend endpoint)
export async function POST(request: NextRequest) {
  try {
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
    const { name, description } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Validate name format (lowercase, no spaces, alphanumeric with underscores)
    const nameRegex = /^[a-z0-9_]+$/
    if (!nameRegex.test(name)) {
      return NextResponse.json({ 
        error: 'Name must be lowercase alphanumeric with underscores only' 
      }, { status: 400 })
    }

    // Check if category already exists
    const existing = await query<Category>(`
      SELECT name FROM clubs WHERE name = $1
    `, [name])

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Category already exists' }, { status: 409 })
    }

    const [created] = await query<Category>(`
      INSERT INTO clubs (name, description, member_count, created_at, updated_at)
      VALUES ($1, $2, 0, NOW(), NOW())
      RETURNING name, description, member_count AS name_count, created_at, updated_at
    `, [name, description || null])

    console.log(`[cats] Created category: ${name}`)

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    console.error('Create category error:', error)
    
    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({ 
        error: 'Database not configured. Set DATABASE_URL environment variable.' 
      }, { status: 503 })
    }
    
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
