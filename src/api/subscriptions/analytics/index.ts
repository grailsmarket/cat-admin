export type SubscriberAnalyticsData = {
  from: string
  to: string
  summary: {
    totalRequests: number
    uniqueUsers: number
    uniqueRoutes: number
  }
  daily: Array<{ date: string; total: number }>
  topRoutes: Array<{ route: string; requestCount: number; uniqueUsers: number }>
  topUsers: Array<{
    address: string
    userId: number
    maxTierId: number
    requestCount: number
    uniqueRoutes: number
  }>
  userDrilldown?: {
    address: string
    routes: Array<{ route: string; requestCount: number }>
    daily: Array<{ date: string; total: number }>
  }
}

export async function fetchSubscriberAnalytics(
  from: string,
  to: string,
  user?: string
): Promise<{ success: boolean; data?: SubscriberAnalyticsData; error?: string }> {
  try {
    let url = `/api/subscriptions/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    if (user) url += `&user=${encodeURIComponent(user)}`

    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return { success: false, error: error.error || 'Failed to fetch subscriber analytics' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch subscriber analytics',
    }
  }
}
