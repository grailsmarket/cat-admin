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
