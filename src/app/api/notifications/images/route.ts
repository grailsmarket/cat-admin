import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { verifyAdmin } from '@/lib/auth'
import { uploadFile, validateImageFile, getExtensionFromMime, isStorageEnabled } from '@/lib/storage'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

// POST /api/notifications/images - upload a single image for use in an admin broadcast.
// Returns { key, url } where url is the public backend proxy URL to embed in the notification.
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { isAdmin, address } = await verifyAdmin(token)
    if (!isAdmin || !address) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (!isStorageEnabled()) {
      return NextResponse.json({ error: 'S3 storage not configured' }, { status: 503 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    const validationError = validateImageFile(file)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const ext = getExtensionFromMime(file.type)
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`
    const key = `broadcasts/${name}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(key, buffer, file.type)

    console.log(`[notifications/images] Uploaded ${key} by ${address}`)

    return NextResponse.json({
      success: true,
      data: {
        key,
        url: `${GRAILS_API_URL}/broadcasts/images/${name}`,
      },
    })
  } catch (error) {
    console.error('Notification image upload error:', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
