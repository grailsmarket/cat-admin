'use client'

import { useMemo } from 'react'
import { WagmiProvider, type State } from 'wagmi'
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
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
              <Toaster
                position='top-center'
                theme='dark'
                toastOptions={{
                  style: {
                    textAlign: 'center',
                    justifyContent: 'center',
                  },
                  classNames: {
                    success: '!bg-[#0a2614] !border-success/40 !text-success',
                    error: '!bg-[#2a0a0a] !border-error/40 !text-error',
                    warning: '!bg-[#2a2200] !border-warning/40 !text-warning',
                    info: '!bg-[#0a1a2e] !border-primary/40 !text-primary',
                  },
                }}
              />
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

