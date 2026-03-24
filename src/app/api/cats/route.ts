import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { validateClassifications } from '@/constants/classifications'
import { uploadFile, deleteFile, validateImageFile, getExtensionFromMime, isStorageEnabled } from '@/lib/storage'
import { normalizeEnsName } from '@/lib/normalize'
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
      avatar_url: cat.avatar_image_key ? `/api/cats/${cat.name}/images?type=avatar` : null,
      header_url: cat.header_image_key ? `/api/cats/${cat.name}/images?type=header` : null,
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

// POST /api/cats - Create category (atomic: S3 first, then single DB transaction)
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
    const namesJson = formData.get('names') as string | null
    const avatarFile = formData.get('avatar') as File | null
    const headerFile = formData.get('header') as File | null

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    let rawClassifications: unknown = []
    if (classificationsJson) {
      try {
        rawClassifications = JSON.parse(classificationsJson)
      } catch {
        return NextResponse.json({ error: 'Invalid classifications JSON' }, { status: 400 })
      }
    }
    const classifications = Array.isArray(rawClassifications)
      ? validateClassifications(rawClassifications)
      : []

    // Parse and normalize ENS names if provided
    const normalizedNames: string[] = []
    const invalidNames: string[] = []
    if (namesJson) {
      let rawNames: unknown = []
      try {
        rawNames = JSON.parse(namesJson)
      } catch {
        return NextResponse.json({ error: 'Invalid names JSON' }, { status: 400 })
      }
      if (Array.isArray(rawNames)) {
        const MAX_NAMES_PER_REQUEST = 1000
        if (rawNames.length > MAX_NAMES_PER_REQUEST) {
          return NextResponse.json(
            { error: `Maximum ${MAX_NAMES_PER_REQUEST} names per request` },
            { status: 400 }
          )
        }
        for (const n of rawNames) {
          if (typeof n !== 'string') continue
          const withSuffix = n.endsWith('.eth') ? n : `${n}.eth`
          const normalized = normalizeEnsName(withSuffix)
          if (normalized) {
            normalizedNames.push(normalized)
          } else {
            invalidNames.push(n)
          }
        }
      }
    }

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

    // Phase 1: Upload images to S3 (reversible - we can delete on failure)
    let avatarKey: string | null = null
    let headerKey: string | null = null

    try {
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
    } catch (s3Error) {
      // Clean up any successfully uploaded image before failing
      if (avatarKey) await deleteFile(avatarKey).catch(() => {})
      if (headerKey) await deleteFile(headerKey).catch(() => {})
      console.error('S3 upload failed during category creation:', s3Error)
      return NextResponse.json({ error: 'Failed to upload images' }, { status: 500 })
    }

    // Phase 2: Single atomic DB transaction (category + image keys + memberships)
    let created: Category
    let membersAdded = 0
    let membersSkipped = 0

    try {
      const result = await withActorTransaction(address, async (client) => {
        const insertResult = await client.query(`
          INSERT INTO clubs (name, display_name, description, classifications, avatar_image_key, header_image_key, member_count, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())
          RETURNING name, display_name, description, member_count AS name_count,
            COALESCE(classifications, ARRAY[]::TEXT[]) AS classifications,
            avatar_image_key, header_image_key, created_at, updated_at
        `, [
          name,
          displayName || null,
          description || null,
          classifications.length > 0 ? classifications : null,
          avatarKey,
          headerKey,
        ])

        const category = insertResult.rows[0] as Category

        // Insert memberships in the same transaction
        let added = 0
        let skipped = 0
        for (const ensName of normalizedNames) {
          const memberResult = await client.query(`
            INSERT INTO club_memberships (club_name, ens_name, added_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (club_name, ens_name) DO NOTHING
            RETURNING club_name
          `, [name, ensName])

          if (memberResult.rowCount && memberResult.rowCount > 0) {
            added++
          } else {
            skipped++
          }
        }

        return { category, added, skipped }
      })

      created = result.category
      membersAdded = result.added
      membersSkipped = result.skipped
    } catch (dbError) {
      // DB failed - clean up S3 uploads
      if (avatarKey) await deleteFile(avatarKey).catch(() => {})
      if (headerKey) await deleteFile(headerKey).catch(() => {})
      console.error('DB transaction failed during category creation:', dbError)

      if (dbError instanceof Error && dbError.message.includes('DATABASE_URL')) {
        return NextResponse.json({
          error: 'Database not configured. Set DATABASE_URL environment variable.',
        }, { status: 503 })
      }

      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
    }

    const responseData = {
      ...created,
      avatar_url: avatarKey ? `/api/cats/${name}/images?type=avatar` : null,
      header_url: headerKey ? `/api/cats/${name}/images?type=header` : null,
    }

    const parts = [`[cats] Created category: ${name} by ${address}`]
    if (membersAdded > 0) parts.push(`(${membersAdded} names added, ${membersSkipped} skipped)`)
    if (invalidNames.length > 0) parts.push(`(${invalidNames.length} invalid names excluded)`)
    console.log(parts.join(' '))

    return NextResponse.json({
      success: true,
      data: responseData,
      ...(normalizedNames.length > 0 && { members: { added: membersAdded, skipped: membersSkipped } }),
      ...(invalidNames.length > 0 && { invalidNames }),
    }, { status: 201 })
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
