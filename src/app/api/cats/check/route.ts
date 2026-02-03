import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { checkCategoryInGrails } from '@/lib/grails-check'

// GET /api/cats/check?slug=my_category - Check if category is set up in grails
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const slug = request.nextUrl.searchParams.get('slug')
    
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9_]+$/
    if (!slugRegex.test(slug)) {
      return NextResponse.json({ 
        error: 'Invalid slug format',
        checks: {
          avatar: false,
          header: false,
        },
        isLive: false,
      })
    }

    const result = await checkCategoryInGrails(slug)
    
    return NextResponse.json({
      success: true,
      slug,
      ...result,
    })
  } catch (error) {
    console.error('Check category error:', error)
    return NextResponse.json({ error: 'Failed to check category' }, { status: 500 })
  }
}

