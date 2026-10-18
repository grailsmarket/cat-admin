'use client'

import { useAccount } from 'wagmi'
import type { Address } from 'viem'
import { useContext, createContext, useCallback, useState } from 'react'
import { useSiwe } from 'ethereum-identity-kit'
import { DAY_IN_SECONDS } from '@/constants/time'
import { fetchNonce } from '@/api/auth/fetchNonce'
import { useAuth } from '@/hooks/useAuth'
import { AuthenticationStatus } from '@rainbow-me/rainbowkit'
import { can as hasPermission, type Action, type Permission, type Section } from '@/lib/permissions'

type UserContextType = {
  userAddress: Address | undefined
  authStatus: AuthenticationStatus
  authStatusIsLoading: boolean
  isAdmin: boolean
  permissions: Permission[]
  can: (section?: Section, action?: Action) => boolean
  isSigningIn: boolean
  handleSignIn: () => void
  handleSignOut: () => void
}

type Props = {
  children: React.ReactNode
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export const UserProvider: React.FC<Props> = ({ children }) => {
  const [isSigningIn, setIsSigningIn] = useState(false)

  const { address } = useAccount()
  const { authStatus, verify, refetchAuthStatus, signOut, disconnect, authStatusIsLoading, isAdmin, permissions } =
    useAuth()

  const handleGetNonce = useCallback(async () => {
    if (!address) throw new Error('No address found')
    return await fetchNonce(address)
  }, [address])

  const handleSignInSuccess = async () => {
    await refetchAuthStatus()
    setIsSigningIn(false)
  }

  const handleSignInError = (error: Error) => {
    console.error('Sign in error:', error)
    setIsSigningIn(false)
    disconnect()
  }

  const { handleSignIn } = useSiwe({
    verifySignature: verify,
    onSignInSuccess: handleSignInSuccess,
    onSignInError: handleSignInError,
    message: 'Cat Admin wants you to sign in',
    getNonce: handleGetNonce,
    expirationTime: DAY_IN_SECONDS * 1000,
  })

  const can = useCallback(
    (section?: Section, action?: Action) => hasPermission(permissions, section, action),
    [permissions]
  )

  const handleSignOut = () => {
    signOut()
  }

  return (
    <UserContext.Provider
      value={{
        userAddress: address,
        authStatus,
        authStatusIsLoading,
        isAdmin,
        permissions,
        can,
        isSigningIn,
        handleSignIn,
        handleSignOut,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export const useUserContext = (): UserContextType => {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider')
  }
  return context
}

