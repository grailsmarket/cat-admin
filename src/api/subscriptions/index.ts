import type { SubscriptionStatus, TierId } from '@/lib/tiers'

export interface SubscriptionRow {
  id: number
  user_id: number
  address: string | null
  tier: string
  tier_id: number
  status: string
  started_at: string
  expires_at: string | null
  cancelled_at: string | null
  payment_method: string | null
  payment_tx_hash: string | null
  payment_amount_wei: string | null
  granted_by_user_id: number | null
  granted_by_address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionListResponse {
  success: boolean
  data?: {
    entries: SubscriptionRow[]
    pagination: {
      page: number
      limit: number
      totalEntries: number
      totalPages: number
    }
  }
  error?: string
}

export interface SubscriptionFilters {
  search?: string
  tierIds?: TierId[]
  statuses?: SubscriptionStatus[]
  sort?: 'expires_at' | 'started_at' | 'tier_id' | 'created_at' | 'updated_at'
  dir?: 'asc' | 'desc'
}

export async function fetchSubscriptions(
  page = 1,
  limit = 50,
  filters: SubscriptionFilters = {}
): Promise<SubscriptionListResponse> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (filters.search) params.set('search', filters.search)
  if (filters.sort) params.set('sort', filters.sort)
  if (filters.dir) params.set('dir', filters.dir)
  for (const t of filters.tierIds ?? []) params.append('tierIds', String(t))
  for (const s of filters.statuses ?? []) params.append('statuses', s)

  const response = await fetch(`/api/subscriptions?${params.toString()}`, {
    credentials: 'include',
  })
  return response.json()
}

export async function cancelSubscription(id: number): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`/api/subscriptions/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })
  return response.json()
}

export async function extendSubscription(
  id: number,
  expiresAt: string
): Promise<{ success: boolean; error?: string; data?: { expiresAt: string } }> {
  const response = await fetch(`/api/subscriptions/${id}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ expiresAt }),
  })
  return response.json()
}
