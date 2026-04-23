export type TierId = 1 | 2 | 3

export const TIER_LABELS: Record<TierId, string> = {
  1: 'Plus',
  2: 'Pro',
  3: 'Gold',
}

export const TIER_IDS: TierId[] = [1, 2, 3]

export type TierIdWithFree = 0 | TierId

export const ALL_TIER_LABELS: Record<TierIdWithFree, string> = {
  0: 'Free',
  1: 'Plus',
  2: 'Pro',
  3: 'Gold',
}

export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'cancelled', 'superseded'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]
