import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'

// Check authentication status
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value

    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { isAdmin, address } = await verifyAdmin(token)

    if (!address) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      data: {
        address,
        isAdmin,
      },
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ success: false, error: 'Authentication check failed' }, { status: 500 })
  }
}

