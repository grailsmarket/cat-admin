export type OverviewMetric = {
  total: number
  last1d: number
  last7d: number
  last30d: number
}

export type OverviewStats = {
  users: OverviewMetric
  nameViews: OverviewMetric
  profileViews: OverviewMetric
  apiRequests: OverviewMetric
}

export async function fetchOverviewStats(): Promise<{ success: boolean; data?: OverviewStats; error?: string }> {
  try {
    const response = await fetch('/api/stats/overview', {
      credentials: 'include',
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch overview stats' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch overview stats'
    }
  }
}
