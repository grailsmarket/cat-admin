export type TierId = 1 | 2 | 3

export const TIER_LABELS: Record<TierId, string> = {
  1: 'Plus',
  2: 'Pro',
  3: 'Gold',
}

export const TIER_IDS: TierId[] = [1, 2, 3]

/**
 * DB-canonical tier string for each tier_id. Matches the valid_tier constraint
 * (`tier IN ('free', 'plus', 'pro', 'gold')`) set in backend migration 0760.
 * When inserting into user_subscriptions or updating users.tier, always source
 * the string from this map so tier and tier_id stay consistent.
 */
export const TIER_ID_TO_DB_NAME: Record<TierId, 'plus' | 'pro' | 'gold'> = {
  1: 'plus',
  2: 'pro',
  3: 'gold',
}

export type TierIdWithFree = 0 | TierId

export const ALL_TIER_LABELS: Record<TierIdWithFree, string> = {
  0: 'Free',
  1: 'Plus',
  2: 'Pro',
  3: 'Gold',
}

export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'cancelled', 'superseded'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]
