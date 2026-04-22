import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { verifyAdmin } from '@/lib/auth'
import { uploadFile, validateImageFile, getExtensionFromMime, isStorageEnabled } from '@/lib/storage'
import { APP_URL } from '@/constants'

// POST /api/notifications/images - Upload a notification image to S3.
// Returns an absolute URL because consumers (email, Telegram) fetch it outside this app.
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

    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    const ext = getExtensionFromMime(file.type)
    const slug = `${now.getTime()}-${randomBytes(6).toString('hex')}`
    const key = `notifications/${yyyy}/${mm}/${slug}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(key, buffer, file.type)

    const imageUrl = `${APP_URL.replace(/\/$/, '')}/api/notifications/images/${yyyy}/${mm}/${slug}.${ext}`
    console.log(`[notifications] Image uploaded: ${key} by ${address}`)

    return NextResponse.json({ success: true, data: { imageUrl } })
  } catch (error) {
    console.error('Upload notification image error:', error)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
