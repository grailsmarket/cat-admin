import type { SourceName } from '@/constants/referrers'

export type SourceBreakdown = {
  date: string
  total: number
} & Record<SourceName, number>

export type AnalyticsData = {
  from: string
  to: string
  bucket: 'hour' | 'day' | 'week'
  registrations: SourceBreakdown[]
  renewals: SourceBreakdown[]
  summary: {
    totalRegistrations: number
    totalRenewals: number
    registrationsBySource: Record<string, number>
    renewalsBySource: Record<string, number>
  }
}

export type RequestAnalyticsData = {
  from: string
  to: string
  summary: {
    totalRequests: number
    uniqueUsers: number
    uniqueRoutes: number
  }
  daily: Array<{ date: string; total: number }>
  topRoutes: Array<{ route: string; requestCount: number; uniqueUsers: number }>
  topUsers: Array<{ address: string; userId: number; requestCount: number; uniqueRoutes: number }>
  userDrilldown?: {
    address: string
    routes: Array<{ route: string; requestCount: number }>
    daily: Array<{ date: string; total: number }>
  }
}

export async function fetchRequestAnalytics(
  from: string,
  to: string,
  user?: string
): Promise<{ success: boolean; data?: RequestAnalyticsData; error?: string }> {
  try {
    let url = `/api/analytics/requests?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    if (user) {
      url += `&user=${encodeURIComponent(user)}`
    }

    const response = await fetch(url, { credentials: 'include' })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch request analytics' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch request analytics',
    }
  }
}

export type ViewsAnalyticsData = {
  from: string
  to: string
  summary: {
    totalNameViews: number
    uniqueNames: number
    totalProfileViews: number
    uniqueProfiles: number
  }
  nameViewsDaily: Array<{ date: string; total: number }>
  profileViewsDaily: Array<{ date: string; total: number }>
  topNames: Array<{ name: string; viewCount: number; uniqueViewers: number }>
  topProfiles: Array<{ address: string; viewCount: number; uniqueViewers: number }>
}

export async function fetchViewsAnalytics(
  from: string,
  to: string
): Promise<{ success: boolean; data?: ViewsAnalyticsData; error?: string }> {
  try {
    const response = await fetch(
      `/api/analytics/views?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { credentials: 'include' }
    )

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch views analytics' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch views analytics',
    }
  }
}

export async function fetchRegistrationAnalytics(
  from: string,
  to: string
): Promise<{ success: boolean; data?: AnalyticsData; error?: string }> {
  try {
    const response = await fetch(
      `/api/analytics/registrations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { credentials: 'include' }
    )

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch analytics' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch analytics',
    }
  }
}
