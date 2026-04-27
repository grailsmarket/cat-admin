/**
 * Endpoints that require a Plus-or-above subscription. Used by the Subscriber
 * Analytics page to filter api_request_logs. The `route` column in that table
 * stores Fastify's `request.routeOptions.url` (see backend services/api/src/index.ts),
 * which is the route template including the `/api/v1` prefix.
 *
 * Update this list when a new `requireMinTier` preHandler is added on the backend.
 * Grep `backend/services/api/src/routes/` for `requireMinTier` / `requireTier`.
 */

export type TierGatedRoute = {
  /**
   * Fastify route template. Use a trailing `/*` to match any path under the prefix.
   * Example: '/api/v1/saved-searches/*' matches GET /api/v1/saved-searches/:id, etc.
   */
  pattern: string
  /** HTTP method. Omit to match any method on this route. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Minimum tier required. All current entries are 'plus'. */
  minTier: 'plus' | 'pro' | 'gold'
}

export const TIER_GATED_ROUTES: TierGatedRoute[] = [
  // All saved-searches endpoints
  { pattern: '/api/v1/saved-searches/*', minTier: 'plus' },
  { pattern: '/api/v1/saved-searches', minTier: 'plus' },

  // All dashboard-layouts endpoints
  { pattern: '/api/v1/dashboard-layouts/*', minTier: 'plus' },
  { pattern: '/api/v1/dashboard-layouts', minTier: 'plus' },

  // Offers: specific tier-gated endpoints (others in offers.ts are public)
  { pattern: '/api/v1/offers/cancel', method: 'POST', minTier: 'plus' },
  { pattern: '/api/v1/offers/bulk', method: 'POST', minTier: 'plus' },
  { pattern: '/api/v1/offers/bulk/:groupId', method: 'DELETE', minTier: 'plus' },
  { pattern: '/api/v1/offers/criteria', method: 'POST', minTier: 'plus' },
  { pattern: '/api/v1/offers/criteria/:id', method: 'DELETE', minTier: 'plus' },
  { pattern: '/api/v1/offers/:id/edit', method: 'PUT', minTier: 'plus' },
  { pattern: '/api/v1/offers/bulk/edit', method: 'PUT', minTier: 'plus' },
  { pattern: '/api/v1/offers/n-of-many', method: 'POST', minTier: 'plus' },
  { pattern: '/api/v1/offers/n-of-many/:groupId', method: 'DELETE', minTier: 'plus' },
]

/**
 * Convert the config to a SQL-friendly shape: a list of
 * { routePattern, method | null, isPrefix } rows that the analytics query
 * can turn into a WHERE clause.
 */
export function flattenGatedRoutes() {
  return TIER_GATED_ROUTES.map((r) => {
    const isPrefix = r.pattern.endsWith('/*')
    const exact = isPrefix ? r.pattern.slice(0, -2) : r.pattern
    return {
      pattern: exact,
      isPrefix,
      method: r.method ?? null,
      minTier: r.minTier,
    }
  })
}
