/**
 * In-memory rate limiter using sliding window algorithm.
 * 
 * Note: This resets on deploy/restart. For an admin panel with
 * low traffic and infrequent deploys, this is acceptable.
 * For high-traffic public APIs, use Redis-based solution.
 */

type RateLimitRecord = {
  count: number
  resetAt: number
}

// Store: IP -> { count, resetAt }
const store = new Map<string, RateLimitRecord>()

// Cleanup interval (every 5 minutes, remove expired entries)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  
  lastCleanup = now
  for (const [key, record] of store.entries()) {
    if (now > record.resetAt) {
      store.delete(key)
    }
  }
}

export type RateLimitResult = {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * Check if a request should be rate limited.
 * 
 * @param identifier - Unique identifier (usually IP address)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Whether the request is allowed and remaining quota
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanup()
  
  const now = Date.now()
  const key = identifier
  const record = store.get(key)
  
  // New visitor or window expired - start fresh
  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { success: true, remaining: limit - 1, resetAt }
  }
  
  // Within window - check limit
  if (record.count >= limit) {
    return { success: false, remaining: 0, resetAt: record.resetAt }
  }
  
  // Increment and allow
  record.count++
  return { success: true, remaining: limit - record.count, resetAt: record.resetAt }
}

/**
 * Pre-configured rate limiters for different endpoint types.
 */
export const rateLimiters = {
  // Auth endpoints: 50 requests per minute
  auth: (ip: string) => rateLimit(ip, 50, 60 * 1000),
  
  // General API: 300 requests per minute
  api: (ip: string) => rateLimit(ip, 300, 60 * 1000),
  
  // Write operations: 150 requests per minute
  write: (ip: string) => rateLimit(ip, 150, 60 * 1000),
}

/**
 * Get current store size (for debugging/monitoring).
 */
export function getRateLimitStoreSize(): number {
  return store.size
}

