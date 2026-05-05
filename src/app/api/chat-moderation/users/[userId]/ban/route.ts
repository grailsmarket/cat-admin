import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await params
  const body = await request.text()
  const upstream = await fetch(
    `${GRAILS_API_URL}/chats/admin/users/${userId}/ban`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    }
  )
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}
