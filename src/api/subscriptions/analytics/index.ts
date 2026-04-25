export type SubscriptionRevenueRow = {
  id: number
  userId: number
  address: string | null
  tier: string
  tierId: number
  status: string
  startedAt: string
  expiresAt: string | null
  paymentMethod: string | null
  paymentTxHash: string | null
  paymentAmountWei: string | null
  ethAmount: number
  usdAmount: number | null
  ethUsdAtSub: number | null
}

export type SubscriptionRevenueData = {
  from: string
  to: string
  summary: {
    totalSubs: number
    uniqueUsers: number
    totalEth: number
    totalUsdHistorical: number
    currentEthUsd: number | null
    currentPriceTimestamp: string | null
    totalUsdAtCurrent: number | null
  }
  daily: Array<{ date: string; count: number; eth: number; usd: number }>
  subs: SubscriptionRevenueRow[]
  subsLimit: number
  subsTruncated: boolean
}

export async function fetchSubscriptionRevenue(
  from: string,
  to: string
): Promise<{ success: boolean; data?: SubscriptionRevenueData; error?: string }> {
  try {
    const url = `/api/subscriptions/analytics/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return { success: false, error: error.error || 'Failed to fetch subscription revenue' }
    }
    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch subscription revenue',
    }
  }
}

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
