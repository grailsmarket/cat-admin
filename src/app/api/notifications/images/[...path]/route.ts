import { NextRequest, NextResponse } from 'next/server'
import { getFile, isStorageEnabled } from '@/lib/storage'

type RouteParams = {
  params: Promise<{ path: string[] }>
}

// GET /api/notifications/images/<YYYY>/<MM>/<slug>.<ext>
// Public: these images are embedded in emails, Telegram messages, and in-app notifications.
// Keys are namespaced under `notifications/`; traversal segments are rejected.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    if (!isStorageEnabled()) {
      return NextResponse.json({ error: 'S3 storage not configured' }, { status: 503 })
    }

    const { path } = await params
    if (
      !path?.length ||
      path.some((seg) => !seg || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\'))
    ) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
    }

    const key = `notifications/${path.join('/')}`
    const file = await getFile(key)
    if (!file) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    }
    if (file.contentLength) {
      headers['Content-Length'] = String(file.contentLength)
    }

    return new Response(file.body, { headers })
  } catch (error) {
    console.error('Get notification image error:', error)
    return NextResponse.json({ error: 'Failed to retrieve image' }, { status: 500 })
  }
}
