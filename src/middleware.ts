import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

// Rate limit configuration
const RATE_LIMITS = {
  // Auth endpoints: 50 per minute
  auth: { limit: 50, windowMs: 60 * 1000 },
  // Write operations: 150 per minute
  write: { limit: 150, windowMs: 60 * 1000 },
  // General API: 300 per minute
  api: { limit: 300, windowMs: 60 * 1000 },
}

function getClientIp(request: NextRequest): string {
  // Try various headers that might contain the real IP
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can be comma-separated list, take the first
    return forwardedFor.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  // CF-Connecting-IP for Cloudflare
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) {
    return cfIp
  }
  
  // Fallback for local development
  return '127.0.0.1'
}

function getRateLimitConfig(pathname: string): { limit: number; windowMs: number } {
  // Auth endpoints get strictest limits
  if (pathname.startsWith('/api/auth/')) {
    return RATE_LIMITS.auth
  }
  
  // Write operations (POST, PUT, DELETE to /api/cats/*)
  // Note: We can't check method here easily, so we use path-based heuristics
  // The actual method check happens below
  
  // Default API limit
  return RATE_LIMITS.api
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Only rate limit API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  
  const ip = getClientIp(request)
  const config = getRateLimitConfig(pathname)
  
  // Use different buckets for different endpoint types
  const isWriteOperation = ['POST', 'PUT', 'DELETE'].includes(request.method)
  const isAuthEndpoint = pathname.startsWith('/api/auth/')
  
  let bucketKey: string
  if (isAuthEndpoint) {
    bucketKey = `auth:${ip}`
  } else if (isWriteOperation) {
    bucketKey = `write:${ip}`
  } else {
    bucketKey = `read:${ip}`
  }
  
  const effectiveLimit = isWriteOperation ? RATE_LIMITS.write.limit : config.limit
  const effectiveWindow = isWriteOperation ? RATE_LIMITS.write.windowMs : config.windowMs
  
  const result = rateLimit(bucketKey, effectiveLimit, effectiveWindow)
  
  if (!result.success) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
    
    return NextResponse.json(
      { 
        error: 'Too many requests. Please try again later.',
        retryAfter,
      },
      { 
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': effectiveLimit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.toString(),
        },
      }
    )
  }
  
  // Add rate limit headers to successful responses
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Limit', effectiveLimit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.resetAt.toString())
  
  return response
}

// Only run middleware on API routes
export const config = {
  matcher: '/api/:path*',
}

