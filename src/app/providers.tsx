'use client'

import { useMemo } from 'react'
import { WagmiProvider, type State } from 'wagmi'
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DAY_IN_SECONDS, ONE_MINUTE } from '@/constants/time'
import config from '@/lib/wagmi'
import { UserProvider } from '@/context/user'

type ProviderProps = {
  children: React.ReactNode
  initialState?: State
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 1 * DAY_IN_SECONDS, staleTime: 5 * ONE_MINUTE },
  },
})

const Providers: React.FC<ProviderProps> = ({ children, initialState }) => {
  const providers = useMemo(
    () => (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config} initialState={initialState}>
          <RainbowKitProvider coolMode={false} theme={darkTheme()}>
            <UserProvider>
              <div className='relative flex min-h-[100dvh] flex-col'>{children}</div>
            </UserProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    ),
    [initialState, children]
  )

  return providers
}

export default Providers

