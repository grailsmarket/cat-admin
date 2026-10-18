import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { can, parsePermission, type Action, type Permission, type Section } from '@/lib/permissions'

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://grails-api.ethid.org/api/v1'

// Parse admin addresses from env var (re-read each time for hot reload support)
function parseAdminAddresses(): string[] {
  return (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map((addr) => addr.trim().toLowerCase())
    .filter(Boolean)
}

export function getAdminAddresses(): string[] {
  return parseAdminAddresses()
}

export function isAdmin(address: string): boolean {
  const adminAddresses = parseAdminAddresses()
  return adminAddresses.includes(address.toLowerCase())
}

// Parse scoped grants from env var (re-read each time for hot reload support)
// Format: ACCESS_GRANTS=0xabc=analytics:read,dashboard:read;0xdef=categories:write
// Full admin ('*') can only be granted via ADMIN_ADDRESSES.
function parseAccessGrants(): Map<string, Permission[]> {
  const grants = new Map<string, Permission[]>()

  for (const entry of (process.env.ACCESS_GRANTS || '').split(';')) {
    const [rawAddress, rawPermissions] = entry.split('=')
    const address = rawAddress?.trim().toLowerCase()
    if (!address || !rawPermissions) continue

    const permissions: Permission[] = []
    for (const raw of rawPermissions.split(',')) {
      if (!raw.trim()) continue
      const permission = parsePermission(raw)
      if (permission) {
        permissions.push(permission)
      } else {
        console.warn(`[auth] Ignoring invalid ACCESS_GRANTS permission: ${raw.trim()}`)
      }
    }

    grants.set(address, [...(grants.get(address) || []), ...permissions])
  }

  return grants
}

export function getPermissions(address: string): Permission[] {
  if (isAdmin(address)) return ['*']
  return parseAccessGrants().get(address.toLowerCase()) || []
}

type AuthMeResponse = {
  success: boolean
  data?: {
    address: string
    id?: number
    email?: string
  }
}

// Verify token by calling grails-backend
export async function verifyTokenAndGetAddress(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${GRAILS_API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) return null

    const data = (await response.json()) as AuthMeResponse
    return data.data?.address || null
  } catch {
    return null
  }
}

// Combined check: valid token + admin address
export async function verifyAdmin(token: string): Promise<{ isAdmin: boolean; address: string | null }> {
  const address = await verifyTokenAndGetAddress(token)

  if (!address) {
    return { isAdmin: false, address: null }
  }

  return {
    isAdmin: isAdmin(address),
    address,
  }
}

// Helper to get token from request cookies
export function getTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    },
    {} as Record<string, string>
  )

  return cookies['token'] || null
}

function actionForMethod(method: string): Action {
  return method === 'GET' || method === 'HEAD' ? 'read' : 'write'
}

type AccessResult =
  | { ok: true; address: string; token: string; permissions: Permission[] }
  | { ok: false; response: NextResponse }

// Scoped route guard: GET/HEAD require read, everything else requires write.
// Routes that still use verifyAdmin remain full-admin only.
export async function requireAccess(request: NextRequest, section: Section): Promise<AccessResult> {
  const token = request.cookies.get('token')?.value
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const address = await verifyTokenAndGetAddress(token)
  if (!address) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const permissions = getPermissions(address)
  if (!can(permissions, section, actionForMethod(request.method))) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, address, token, permissions }
}
