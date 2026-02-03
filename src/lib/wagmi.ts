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
    projectId: (() => {
      const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      if (!id) {
        throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID environment variable is required')
      }
      return id
    })(),
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

