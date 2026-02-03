import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { AuthenticationStatus } from '@rainbow-me/rainbowkit'
import { verifySignature } from '@/api/auth/verifySignature'
import { checkAuthentication } from '@/api/auth/checkAuthentication'
import { logout } from '@/api/auth/logout'
import { Address } from 'viem'

export const useAuth = () => {
  const [currAddress, setCurrAddress] = useState<Address | null>(null)
  const { address } = useAccount()
  const { disconnect } = useDisconnect()

  const {
    data: authData,
    isLoading: authStatusIsLoading,
    refetch: refetchAuthStatus,
  } = useQuery<{ status: AuthenticationStatus; isAdmin: boolean }>({
    queryKey: ['auth', 'status'],
    queryFn: async () => {
      const result = await checkAuthentication()

      if (result.success && result.data) {
        return {
          status: 'authenticated' as AuthenticationStatus,
          isAdmin: result.data.isAdmin,
        }
      }

      return {
        status: 'unauthenticated' as AuthenticationStatus,
        isAdmin: false,
      }
    },
    placeholderData: { status: 'loading', isAdmin: false },
    initialData: { status: 'loading', isAdmin: false },
    enabled: !!address,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  useEffect(() => {
    if (!address) return

    if (currAddress && address.toLowerCase() !== currAddress.toLowerCase()) {
      logout() // Server clears httpOnly cookie
      refetchAuthStatus()
      setCurrAddress(address)
      return
    }

    refetchAuthStatus()
    setCurrAddress(address)
  }, [address, refetchAuthStatus, currAddress])

  const verify = async (message: string, _: string, signature: string) => {
    const verifyRes = await verifySignature(message, signature)

    if (!verifyRes.success || !verifyRes.data) {
      return
    }

    // Cookie is set by the API route (httpOnly) - no client-side storage needed
    // API routes read from httpOnly cookies via cookies() server function
    return
  }

  const signOut = async () => {
    disconnect()
    await logout() // Server clears httpOnly cookie
    setCurrAddress(null)
    await refetchAuthStatus()
  }

  return {
    address,
    verify,
    signOut,
    disconnect,
    authStatus: authData?.status || 'loading',
    isAdmin: authData?.isAdmin || false,
    authStatusIsLoading,
    refetchAuthStatus,
  }
}

