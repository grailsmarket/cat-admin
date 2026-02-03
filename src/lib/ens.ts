// ENS resolution using ethereum-identity-kit
import { fetchAccount } from 'ethereum-identity-kit'

const cache = new Map<string, string | null>()

export async function resolveAddressToEns(address: string): Promise<string | null> {
  const lowerAddress = address.toLowerCase()
  
  // Check cache first
  const cached = cache.get(lowerAddress)
  if (cached !== undefined) {
    return cached
  }

  try {
    const account = await fetchAccount(address)
    const ensName = account?.ens?.name || null
    
    cache.set(lowerAddress, ensName)
    return ensName
  } catch {
    cache.set(lowerAddress, null)
    return null
  }
}

export async function resolveAddresses(addresses: string[]): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()
  const uniqueAddresses = [...new Set(addresses.filter(Boolean).map(a => a.toLowerCase()))]

  await Promise.all(
    uniqueAddresses.map(async (address) => {
      const ensName = await resolveAddressToEns(address)
      results.set(address, ensName)
    })
  )

  return results
}

