import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

async function checkAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), token: null }
  }
  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), token: null }
  }
  return { error: null, token }
}

export async function GET() {
  const { error, token } = await checkAuth()
  if (error) return error

  const upstream = await fetch(`${GRAILS_API_URL}/valuations/admin/config`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}

export async function PATCH(request: NextRequest) {
  const { error, token } = await checkAuth()
  if (error) return error

  const body = await request.text()
  const upstream = await fetch(`${GRAILS_API_URL}/valuations/admin/config`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })
  const text = await upstream.text()
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}
