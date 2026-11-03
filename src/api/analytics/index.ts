import type { SourceName } from '@/constants/referrers'

export type SourceBreakdown = {
  date: string
  total: number
} & Record<SourceName, number>

export type CostBreakdown = {
  date: string
  total: number
} & Record<SourceName, number>

export type DurationBreakdown = {
  date: string
  total: number
} & Record<SourceName, number>

export type AnalyticsData = {
  from: string
  to: string
  bucket: 'hour' | 'day' | 'week' | 'month'
  registrations: SourceBreakdown[]
  renewals: SourceBreakdown[]
  registrationsCost: CostBreakdown[]
  renewalsCost: CostBreakdown[]
  registrationsDuration: DurationBreakdown[]
  renewalsDuration: DurationBreakdown[]
  summary: {
    totalRegistrations: number
    totalRenewals: number
    totalRegistrationCostEth: number
    totalRenewalCostEth: number
    totalRegistrationDurationYears: number
    totalRenewalDurationYears: number
    registrationsBySource: Record<string, number>
    renewalsBySource: Record<string, number>
    registrationsCostBySource: Record<string, number>
    renewalsCostBySource: Record<string, number>
    registrationsDurationBySource: Record<string, number>
    renewalsDurationBySource: Record<string, number>
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
  to: string,
  bucket?: string
): Promise<{ success: boolean; data?: AnalyticsData; error?: string }> {
  try {
    let url = `/api/analytics/registrations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    if (bucket) {
      url += `&bucket=${encodeURIComponent(bucket)}`
    }
    const response = await fetch(url, { credentials: 'include' })

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

export type MarketShareChannel =
  | 'grails_eth'
  | 'grails_stable'
  | 'relay'
  | 'direct'
  | 'vision'
  | 'snipezone'
  | 'enstools'
  | 'rotki'
  | 'namewhisper'

export type ShareMeasure = {
  measure: 'Names' | 'USD paid' | 'Name-years' | 'Transactions' | 'Wallets'
  grails: number
  total: number
  share: number
}

export type RenewalChannelStats = {
  channel: MarketShareChannel
  names: number
  txs: number
  wallets: number
  usd: number
  name_years: number
  median_usd: number | null
  with_duration: number
  already_expired: number
  still_expired: number
  d_under_7d: number
  d_7_29d: number
  d_30_89d: number
  d_90_363d: number
  d_1y_plus: number
  d_unknown: number
}

export type MarketShareData = {
  from: string
  to: string
  bucket: 'day' | 'week'
  routerError: string | null
  routerTxCount: number
  measures: { renewals: ShareMeasure[]; registrations: ShareMeasure[] }
  renewalChannels: RenewalChannelStats[]
  registrationChannels: Array<{ channel: MarketShareChannel; names: number; txs: number; usd: number }>
  series: Array<{ date: string; grails_eth: number; grails_stable: number; others: number }>
  weekly: Array<{ date: string; grails: number; others: number }>
  comparison: {
    periodDays: number
    current: { grailsPerDay: number; othersPerDay: number }
    previous: { from: string; grailsPerDay: number; othersPerDay: number }
  }
  topRenewers: Array<{
    wallet: string
    names: number
    txs: number
    median_days: number | null
    with_duration: number
    still_expired: number
    paid_eth: boolean
    paid_stable: boolean
  }>
}

export async function fetchMarketShare(
  from: string,
  to: string
): Promise<{ success: boolean; data?: MarketShareData; error?: string }> {
  try {
    const url = `/api/analytics/market-share?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    const response = await fetch(url, { credentials: 'include' })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error || 'Failed to fetch market share' }
    }

    const result = await response.json()
    return { success: true, data: result.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch market share',
    }
  }
}
