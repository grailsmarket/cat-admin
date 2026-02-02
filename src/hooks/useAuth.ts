import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { AuthenticationStatus } from '@rainbow-me/rainbowkit'
import { WEEK_IN_SECONDS } from '@/constants/time'
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
      logout()
      document.cookie = `token=; path=/; max-age=0;`
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

    // Cookie is set by the API route (httpOnly)
    // But we also set a client-side cookie for the token for API calls
    if (verifyRes.data.token) {
      document.cookie = `token=${verifyRes.data.token}; path=/; max-age=${WEEK_IN_SECONDS};`
    }

    return
  }

  const signOut = async () => {
    disconnect()
    await logout()
    setCurrAddress(null)
    document.cookie = `token=; path=/; max-age=0;`
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

