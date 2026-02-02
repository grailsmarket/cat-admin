'use client'

import { useUserContext } from '@/context/user'
import { ConnectButton } from '@rainbow-me/rainbowkit'

type Props = {
  children: React.ReactNode
}

export default function AdminGate({ children }: Props) {
  const { userAddress, authStatus, authStatusIsLoading, isAdmin, handleSignIn, isSigningIn } = useUserContext()

  // Loading state
  if (authStatusIsLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='text-center'>
          <div className='border-primary mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent' />
          <p className='text-neutral'>Loading...</p>
        </div>
      </div>
    )
  }

  // Not connected
  if (!userAddress) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='card max-w-md text-center'>
          <h1 className='mb-4 text-2xl font-bold'>Cat Admin</h1>
          <p className='text-neutral mb-6'>Connect your wallet to access the admin panel.</p>
          <ConnectButton />
        </div>
      </div>
    )
  }

  // Connected but not authenticated
  if (authStatus === 'unauthenticated') {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='card max-w-md text-center'>
          <h1 className='mb-4 text-2xl font-bold'>Sign In Required</h1>
          <p className='text-neutral mb-6'>Please sign the message with your wallet to continue.</p>
          <button onClick={handleSignIn} disabled={isSigningIn} className='btn btn-primary w-full'>
            {isSigningIn ? 'Signing...' : 'Sign In'}
          </button>
        </div>
      </div>
    )
  }

  // Authenticated but not admin
  if (!isAdmin) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='card max-w-md text-center'>
          <h1 className='text-error mb-4 text-2xl font-bold'>Access Denied</h1>
          <p className='text-neutral mb-4'>
            Your wallet address is not authorized to access the admin panel.
          </p>
          <p className='mb-6 font-mono text-sm break-all'>{userAddress}</p>
          <ConnectButton />
        </div>
      </div>
    )
  }

  // Authenticated admin - show children
  return <>{children}</>
}

