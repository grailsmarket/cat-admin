import type { AuditLogEntry } from '@/types'

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

  const response = await fetch(`/api/activity?${params.toString()}`)
  
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to fetch activity')
  }

  return response.json()
}

