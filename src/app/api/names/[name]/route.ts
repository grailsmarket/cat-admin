import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { normalizeEnsName } from '@/lib/normalize'

type RouteParams = {
  params: Promise<{ name: string }>
}

const GRAILS_API_URL = process.env.GRAILS_API_URL

// GET /api/names/[name] - Get ENS name details via grails-backend
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { name: rawName } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { isAdmin } = await verifyAdmin(token)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Normalize the ENS name
    const normalizedName = normalizeEnsName(rawName)
    if (!normalizedName) {
      return NextResponse.json({ error: 'Invalid ENS name format' }, { status: 400 })
    }

    if (!GRAILS_API_URL) {
      return NextResponse.json({ error: 'GRAILS_API_URL not configured' }, { status: 503 })
    }

    // Proxy to grails-backend /names/:name endpoint
    const response = await fetch(`${GRAILS_API_URL}/names/${encodeURIComponent(normalizedName)}`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'ENS name not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch name from backend' }, { status: response.status })
    }

    const data = await response.json()

    if (!data.success) {
      return NextResponse.json({ error: data.error || 'Name not found' }, { status: 404 })
    }

    const d = data.data

    // Return the full name data
    return NextResponse.json({
      // Core info
      name: d.name,
      token_id: d.token_id,
      owner: d.owner,
      
      // Dates
      expiry_date: d.expiry_date,
      registration_date: d.registration_date,
      
      // Categories
      clubs: d.clubs || [],
      
      // Characteristics
      has_numbers: d.has_numbers,
      has_emoji: d.has_emoji,
      
      // Market data
      listings: d.listings || [],
      highest_offer_wei: d.highest_offer_wei,
      highest_offer_currency: d.highest_offer_currency,
      last_sale_price: d.last_sale_price,
      last_sale_price_usd: d.last_sale_price_usd,
      last_sale_currency: d.last_sale_currency,
      last_sale_date: d.last_sale_date,
      
      // Engagement
      view_count: d.view_count,
      watchers_count: d.watchers_count,
    })
  } catch (error) {
    console.error('Lookup name error:', error)
    return NextResponse.json({ error: 'Failed to lookup name' }, { status: 500 })
  }
}
