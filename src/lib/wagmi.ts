import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { mainnet } from 'wagmi/chains'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import { http, createStorage, cookieStorage, createConfig } from 'wagmi'
import { APP_DESCRIPTION, APP_ICON, APP_NAME, APP_URL } from '@/constants'

coinbaseWallet.preference = 'all'

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [coinbaseWallet, injectedWallet],
    },
    {
      groupName: 'Popular',
      wallets: [rainbowWallet, metaMaskWallet, walletConnectWallet],
    },
  ],
  {
    appName: APP_NAME,
    // Fallback projectId for development - replace in production
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'd4f234136ca6a7efeed7abf93474125b',
    appDescription: APP_DESCRIPTION,
    appUrl: APP_URL,
    appIcon: APP_ICON,
  }
)

const config = createConfig({
  ssr: true,
  connectors,
  chains: [mainnet],
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [mainnet.id]: http('https://eth.llamarpc.com', { batch: true }),
  },
})

export default config

