import type { AuditLogEntry } from '@/types'

// Fetch unique actor addresses from audit log
export async function fetchActors(): Promise<string[]> {
  const response = await fetch('/api/activity/actors')
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch actors')
  }

  return data.data || []
}

export type ActivityResponse = {
  success: boolean
  data?: {
    entries: AuditLogEntry[]
    pagination: {
      page: number
      limit: number
      totalEntries: number
      totalPages: number
    }
  }
  error?: string
}

export type ActivityFilters = {
  table?: 'clubs' | 'club_memberships'
  operation?: 'INSERT' | 'UPDATE' | 'DELETE'
  actor?: string
  hideSystem?: boolean
  category?: string // Filter by category name
  name?: string // Filter by ENS name
  days?: number // Limit to last N days
}

export async function fetchActivity(
  page: number = 1,
  limit: number = 50,
  filters: ActivityFilters = {}
): Promise<ActivityResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  })

  if (filters.table) params.set('table', filters.table)
  if (filters.operation) params.set('operation', filters.operation)
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.hideSystem) params.set('hideSystem', 'true')
  if (filters.category) params.set('category', filters.category)
  if (filters.name) params.set('name', filters.name)
  if (filters.days) params.set('days', filters.days.toString())

  const response = await fetch(`/api/activity?${params.toString()}`)
  
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to fetch activity')
  }

  return response.json()
}

