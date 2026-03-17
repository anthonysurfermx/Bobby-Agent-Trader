// src/config/reown.ts
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, polygon, arbitrum, optimism, base } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

// 1. Get projectId from https://cloud.reown.com
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '4d0d8421a091e769c3306153621ea088'

// X Layer (OKX L2 — chain 196)
const xlayer = {
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' } },
} as const satisfies AppKitNetwork

// 2. Set up Wagmi adapter
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [xlayer, mainnet, polygon, arbitrum, optimism, base]

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
})

// 3. Configure metadata
const appUrl =
  typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://defimexico.org';

export const metadata = {
  name: 'DeFi México Hub',
  description: 'El Hub #1 de DeFi en México',
  url: appUrl,
  icons: ['https://defimexico.org/icon.png'],
};

// 4. Create modal
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#10b981', // emerald-500
    '--w3m-border-radius-master': '0.5rem',
  }
})

export const config = wagmiAdapter.wagmiConfig
