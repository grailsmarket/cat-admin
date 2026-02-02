// Listing info from grails-backend
export interface NameListing {
  id: number
  price: string
  price_wei: string
  currency_address: string
  status: string
  seller_address: string
  order_hash?: string
  expires_at: string
  created_at?: string
  source: string
  broker_address?: string | null
  broker_fee_bps?: number | null
}

// Response from grails-backend /names/:name proxied through our API
export interface EnsNameDetails {
  // Core info
  name: string
  token_id: string
  owner: string | null
  
  // Dates
  expiry_date: string | null
  registration_date: string | null
  
  // Categories
  clubs: string[]
  
  // Characteristics
  has_numbers: boolean
  has_emoji: boolean
  
  // Market data
  listings: NameListing[]
  highest_offer_wei: string | null
  highest_offer_currency: string | null
  last_sale_price: string | null
  last_sale_price_usd: string | null
  last_sale_currency: string | null
  last_sale_date: string | null
  
  // Engagement
  view_count: number
  watchers_count: number
}

// Fetch ENS name details (proxied from grails-backend)
export async function fetchEnsName(name: string): Promise<EnsNameDetails> {
  const response = await fetch(`/api/names/${encodeURIComponent(name)}`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch ENS name')
  }

  return response.json()
}

// Remove categories from an ENS name (direct DB operation)
export async function removeCategoriesFromName(
  name: string,
  categories: string[]
): Promise<{ success: boolean; removed: number }> {
  const response = await fetch(`/api/names/${encodeURIComponent(name)}/categories`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories }),
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to remove categories')
  }

  return response.json()
}
