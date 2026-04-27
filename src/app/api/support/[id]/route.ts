import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

async function authorize() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) {
    return { token: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { isAdmin } = await verifyAdmin(token)
  if (!isAdmin) {
    return { token: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { token, response: null }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { token, response } = await authorize()
  if (!token) return response!
  const { id } = await params

  const upstream = await fetch(`${GRAILS_API_URL}/admin/support/tickets/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { token, response } = await authorize()
  if (!token) return response!
  const { id } = await params

  const requestBody = await request.text()
  const upstream = await fetch(`${GRAILS_API_URL}/admin/support/tickets/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: requestBody,
  })
  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  })
}
