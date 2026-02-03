import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminAddresses } from '@/lib/auth'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

// Proxy to grails-backend for verification, then check admin status
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, signature } = body

    if (!message || !signature) {
      return NextResponse.json({ error: 'Message and signature are required' }, { status: 400 })
    }

    // Proxy to grails-backend
    console.log('[verify] Proxying to grails-backend:', GRAILS_API_URL)
    const response = await fetch(`${GRAILS_API_URL}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, signature }),
    })

    const data = await response.json()
    console.log('[verify] grails-backend response status:', response.status)

    if (!response.ok) {
      console.log('[verify] grails-backend error:', data)
      return NextResponse.json({ error: data.error || 'Failed to verify signature' }, { status: response.status })
    }

    // Extract token and address from grails-backend response
    const token = data.data?.token || data.token
    const address = data.data?.user?.address || data.data?.address

    console.log('[verify] Extracted address:', address)
    console.log('[verify] Token received:', token ? 'yes' : 'no')

    if (!token || !address) {
      console.log('[verify] Full response data:', JSON.stringify(data, null, 2))
      return NextResponse.json({ error: 'Invalid response from auth server' }, { status: 500 })
    }

    // Check if user is admin
    const adminAddresses = getAdminAddresses()
    const userIsAdmin = isAdmin(address)

    // Redacted logging - don't expose admin addresses in logs
    console.log('[verify] Admin check:', userIsAdmin ? 'authorized' : 'denied')

    if (!userIsAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: `Access denied. Your wallet address (${address}) is not authorized. Configure ADMIN_ADDRESSES env var.`,
        },
        { status: 403 }
      )
    }

    // Create response with httpOnly cookie
    const res = NextResponse.json({
      success: true,
      data: {
        token,
        address,
        isAdmin: userIsAdmin,
      },
    })

    // Set httpOnly cookie for security
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    })

    return res
  } catch (error) {
    console.error('Verify error:', error)
    return NextResponse.json({ error: 'Failed to verify signature' }, { status: 500 })
  }
}

