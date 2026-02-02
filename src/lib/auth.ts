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

