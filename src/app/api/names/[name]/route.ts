import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdmin } from '@/lib/auth'
import { normalizeEnsName, safeNormalizeEnsName } from '@/lib/normalize'
import { query } from '@/lib/db'

type RouteParams = {
  params: Promise<{ name: string }>
}

const GRAILS_API_URL = process.env.GRAILS_API_URL

// Fallback: fetch from local DB when grails-backend doesn't have the name
async function getLocalNameData(name: string) {
  // Try to find in ens_names table
  const [ensName] = await query<{ 
    name: string
    clubs: string[] | null
  }>(`
    SELECT name, clubs FROM ens_names WHERE LOWER(name) = LOWER($1)
  `, [name])

  if (ensName) {
    return {
      name: ensName.name,
      clubs: ensName.clubs || [],
      _localOnly: true, // Flag to indicate this is local-only data
    }
  }

  // If not in ens_names, check club_memberships directly
  const memberships = await query<{ club_name: string }>(`
    SELECT DISTINCT club_name FROM club_memberships WHERE LOWER(ens_name) = LOWER($1)
  `, [name])

  if (memberships.length > 0) {
    return {
      name: name,
      clubs: memberships.map(m => m.club_name),
      _localOnly: true,
    }
  }

  return null
}

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

    // Try strict normalization first, fall back to safe normalization for invalid names
    const normalizedName = normalizeEnsName(rawName) || safeNormalizeEnsName(rawName)

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
      // If grails-backend doesn't have it, try local DB fallback
      if (response.status === 404) {
        const localData = await getLocalNameData(normalizedName)
        if (localData) {
          console.log(`[names] Using local fallback for: ${normalizedName}`)
          return NextResponse.json({
            name: localData.name,
            token_id: null,
            owner: null,
            expiry_date: null,
            registration_date: null,
            clubs: localData.clubs,
            has_numbers: false,
            has_emoji: false,
            listings: [],
            highest_offer_wei: null,
            highest_offer_currency: null,
            last_sale_price: null,
            last_sale_price_usd: null,
            last_sale_currency: null,
            last_sale_date: null,
            view_count: 0,
            watchers_count: 0,
            _localOnly: true, // Signal to frontend this is local-only
          })
        }
        return NextResponse.json({ error: 'ENS name not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch name from backend' }, { status: response.status })
    }

    const data = await response.json()

    if (!data.success) {
      // Also try local fallback on API error
      const localData = await getLocalNameData(normalizedName)
      if (localData) {
        console.log(`[names] Using local fallback for: ${normalizedName}`)
        return NextResponse.json({
          name: localData.name,
          token_id: null,
          owner: null,
          expiry_date: null,
          registration_date: null,
          clubs: localData.clubs,
          has_numbers: false,
          has_emoji: false,
          listings: [],
          highest_offer_wei: null,
          highest_offer_currency: null,
          last_sale_price: null,
          last_sale_price_usd: null,
          last_sale_currency: null,
          last_sale_date: null,
          view_count: 0,
          watchers_count: 0,
          _localOnly: true,
        })
      }
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
