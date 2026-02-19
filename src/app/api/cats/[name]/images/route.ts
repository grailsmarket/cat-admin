import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query, withActorTransaction } from '@/lib/db'
import { verifyAdmin } from '@/lib/auth'
import { uploadFile, deleteFile, getFile, validateImageFile, getExtensionFromMime, isStorageEnabled } from '@/lib/storage'

type RouteParams = {
  params: Promise<{ name: string }>
}



// GET /api/cats/[name]/images?type=avatar|header — serve image directly from S3.
// Intentionally unauthenticated: club images are public assets (avatars/headers displayed on grails.app).
// Cache invalidation is handled client-side via &v=N query param after uploads.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isStorageEnabled()) {
      return NextResponse.json({ error: 'S3 storage not configured' }, { status: 503 })
    }

    const { name } = await params
    const type = request.nextUrl.searchParams.get('type')
    if (!type || !['avatar', 'header'].includes(type)) {
      return NextResponse.json({ error: 'type must be "avatar" or "header"' }, { status: 400 })
    }

    const keyColumn = type === 'avatar' ? 'avatar_image_key' : 'header_image_key'
    const [category] = await query<{ [key: string]: string | null }>(
      `SELECT ${keyColumn} FROM clubs WHERE name = $1`,
      [name]
    )
    const imageKey = category?.[keyColumn]
    if (!imageKey) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const file = await getFile(imageKey)
    if (!file) {
      return NextResponse.json({ error: 'Image not found in storage' }, { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    }
    if (file.contentLength) {
      headers['Content-Length'] = String(file.contentLength)
    }

    return new Response(file.body, { headers })
  } catch (error) {
    console.error('Get image error:', error)
    return NextResponse.json({ error: 'Failed to retrieve image' }, { status: 500 })
  }
}

// POST /api/cats/[name]/images - Upload or replace an image
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

    if (!isStorageEnabled()) {
      return NextResponse.json({ error: 'S3 storage not configured' }, { status: 503 })
    }

    const formData = await request.formData()
    const type = formData.get('type') as string | null
    const file = formData.get('file') as File | null

    if (!type || !['avatar', 'header'].includes(type)) {
      return NextResponse.json({ error: 'type must be "avatar" or "header"' }, { status: 400 })
    }

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const validationError = validateImageFile(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Verify category exists and get current image key
    const keyColumn = type === 'avatar' ? 'avatar_image_key' : 'header_image_key'
    const [category] = await query<{ name: string; avatar_image_key: string | null; header_image_key: string | null }>(
      `SELECT name, avatar_image_key, header_image_key FROM clubs WHERE name = $1`,
      [name]
    )

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const oldKey = category[keyColumn]

    // Upload new file
    const ext = getExtensionFromMime(file.type)
    const newKey = `clubs/${name}/${type}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(newKey, buffer, file.type)

    // Delete old file if it exists and has a different key
    if (oldKey && oldKey !== newKey) {
      try {
        await deleteFile(oldKey)
      } catch {
        console.warn(`[images] Failed to delete old ${type} image: ${oldKey}`)
      }
    }

    // Update DB
    await withActorTransaction(address, async (client) => {
      await client.query(
        `UPDATE clubs SET ${keyColumn} = $2, updated_at = NOW() WHERE name = $1`,
        [name, newKey]
      )
    })

    console.log(`[images] Uploaded ${type} for ${name} by ${address}`)

    return NextResponse.json({
      success: true,
      data: {
        [`${type}_image_key`]: newKey,
        avatar_url: (type === 'avatar' ? newKey : category.avatar_image_key)
          ? `/api/cats/${name}/images?type=avatar` : null,
        header_url: (type === 'header' ? newKey : category.header_image_key)
          ? `/api/cats/${name}/images?type=header` : null,
      },
    })
  } catch (error) {
    console.error('Upload image error:', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}

// DELETE /api/cats/[name]/images?type=avatar|header - Remove an image
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

    const type = request.nextUrl.searchParams.get('type')
    if (!type || !['avatar', 'header'].includes(type)) {
      return NextResponse.json({ error: 'type must be "avatar" or "header"' }, { status: 400 })
    }

    const keyColumn = type === 'avatar' ? 'avatar_image_key' : 'header_image_key'
    const [category] = await query<{ name: string; avatar_image_key: string | null; header_image_key: string | null }>(
      `SELECT name, avatar_image_key, header_image_key FROM clubs WHERE name = $1`,
      [name]
    )

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const existingKey = category[keyColumn]
    if (!existingKey) {
      return NextResponse.json({ error: `No ${type} image to delete` }, { status: 404 })
    }

    // Delete from S3
    if (isStorageEnabled()) {
      try {
        await deleteFile(existingKey)
      } catch {
        console.warn(`[images] Failed to delete ${type} from S3: ${existingKey}`)
      }
    }

    // Clear DB key
    await withActorTransaction(address, async (client) => {
      await client.query(
        `UPDATE clubs SET ${keyColumn} = NULL, updated_at = NOW() WHERE name = $1`,
        [name]
      )
    })

    console.log(`[images] Deleted ${type} for ${name} by ${address}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete image error:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
