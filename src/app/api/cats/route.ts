import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { validateClassifications } from '@/constants/classifications'
import { uploadFile, validateImageFile, getExtensionFromMime, isStorageEnabled } from '@/lib/storage'
import type { Category } from '@/types'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://api.grails.app/api/v1'

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

    const categories = await query<Category>(`
      SELECT 
        name,
        display_name,
        description, 
        member_count AS name_count,
        COALESCE(classifications, ARRAY[]::TEXT[]) AS classifications,
        avatar_image_key,
        header_image_key,
        created_at, 
        updated_at
      FROM clubs
      ORDER BY name ASC
    `)

    const data = categories.map(cat => ({
      ...cat,
      avatar_url: cat.avatar_image_key ? `${GRAILS_API_URL}/clubs/${cat.name}/avatar` : null,
      header_url: cat.header_image_key ? `${GRAILS_API_URL}/clubs/${cat.name}/header` : null,
    }))

    return NextResponse.json({ success: true, data })
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

// POST /api/cats - Create category (multipart with optional images)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin, address } = await verifyAdmin(token)
    if (!isAdmin || !address) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const name = formData.get('name') as string | null
    const displayName = formData.get('display_name') as string | null
    const description = formData.get('description') as string | null
    const classificationsJson = formData.get('classifications') as string | null
    const avatarFile = formData.get('avatar') as File | null
    const headerFile = formData.get('header') as File | null

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const rawClassifications = classificationsJson ? JSON.parse(classificationsJson) : []
    const classifications = Array.isArray(rawClassifications)
      ? validateClassifications(rawClassifications)
      : []

    const nameRegex = /^[a-z0-9_]+$/
    if (!nameRegex.test(name)) {
      return NextResponse.json({
        error: 'Name must be lowercase alphanumeric with underscores only',
      }, { status: 400 })
    }

    if (name.length > 50) {
      return NextResponse.json({ error: 'Name must be 50 characters or less' }, { status: 400 })
    }

    if (description && description.length > 500) {
      return NextResponse.json({ error: 'Description must be 500 characters or less' }, { status: 400 })
    }

    if (displayName && displayName.length > 100) {
      return NextResponse.json({ error: 'Display name must be 100 characters or less' }, { status: 400 })
    }

    // Validate image files if provided
    if (avatarFile && avatarFile.size > 0) {
      const err = validateImageFile(avatarFile)
      if (err) return NextResponse.json({ error: `Avatar: ${err}` }, { status: 400 })
    }
    if (headerFile && headerFile.size > 0) {
      const err = validateImageFile(headerFile)
      if (err) return NextResponse.json({ error: `Header: ${err}` }, { status: 400 })
    }

    const existing = await query<Category>(`SELECT name FROM clubs WHERE name = $1`, [name])
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Category already exists' }, { status: 409 })
    }

    // Create category
    const created = await withActorTransaction(address, async (client) => {
      const result = await client.query(`
        INSERT INTO clubs (name, display_name, description, classifications, member_count, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
        RETURNING name, display_name, description, member_count AS name_count,
          COALESCE(classifications, ARRAY[]::TEXT[]) AS classifications,
          avatar_image_key, header_image_key, created_at, updated_at
      `, [name, displayName || null, description || null, classifications.length > 0 ? classifications : null])
      return result.rows[0] as Category
    })

    // Upload images to S3 if provided
    let avatarKey: string | null = null
    let headerKey: string | null = null

    if (avatarFile && avatarFile.size > 0 && isStorageEnabled()) {
      const ext = getExtensionFromMime(avatarFile.type)
      avatarKey = `clubs/${name}/avatar.${ext}`
      const buffer = Buffer.from(await avatarFile.arrayBuffer())
      await uploadFile(avatarKey, buffer, avatarFile.type)
    }

    if (headerFile && headerFile.size > 0 && isStorageEnabled()) {
      const ext = getExtensionFromMime(headerFile.type)
      headerKey = `clubs/${name}/header.${ext}`
      const buffer = Buffer.from(await headerFile.arrayBuffer())
      await uploadFile(headerKey, buffer, headerFile.type)
    }

    // Update DB with image keys if any were uploaded
    if (avatarKey || headerKey) {
      await withActorTransaction(address, async (client) => {
        const setClauses: string[] = ['updated_at = NOW()']
        const values: (string | null)[] = [name]
        let paramIndex = 2

        if (avatarKey) {
          setClauses.push(`avatar_image_key = $${paramIndex}`)
          values.push(avatarKey)
          paramIndex++
        }
        if (headerKey) {
          setClauses.push(`header_image_key = $${paramIndex}`)
          values.push(headerKey)
          paramIndex++
        }

        await client.query(`UPDATE clubs SET ${setClauses.join(', ')} WHERE name = $1`, values)
      })
    }

    const responseData = {
      ...created,
      avatar_image_key: avatarKey || created.avatar_image_key,
      header_image_key: headerKey || created.header_image_key,
      avatar_url: avatarKey ? `${GRAILS_API_URL}/clubs/${name}/avatar` : null,
      header_url: headerKey ? `${GRAILS_API_URL}/clubs/${name}/header` : null,
    }

    console.log(`[cats] Created category: ${name} by ${address}`)

    return NextResponse.json({ success: true, data: responseData }, { status: 201 })
  } catch (error) {
    console.error('Create category error:', error)

    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      return NextResponse.json({
        error: 'Database not configured. Set DATABASE_URL environment variable.',
      }, { status: 503 })
    }

    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
