import { NextRequest, NextResponse } from 'next/server'
import { getPermissions, verifyTokenAndGetAddress } from '@/lib/auth'
import { hasFullAccess } from '@/lib/permissions'

// Check authentication status
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value

    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const address = await verifyTokenAndGetAddress(token)

    if (!address) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    const permissions = getPermissions(address)

    return NextResponse.json({
      success: true,
      data: {
        address,
        isAdmin: hasFullAccess(permissions),
        permissions,
      },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ success: false, error: 'Authentication check failed' }, { status: 500 })
  }
}

