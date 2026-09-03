// src/config/reown.ts
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, polygon, arbitrum, optimism, base, baseSepolia } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

// 1. Get projectId from https://cloud.reown.com
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '4d0d8421a091e769c3306153621ea088'

// 2. Set up Wagmi adapter
// Base is the only network Bobby transacts on (2026-09-03: X Layer retired
// from the wallet; its history stays readable through the explorer links).
// baseSepolia rides along for the canary challenge flow on /protocol/calls.
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [base, mainnet, polygon, arbitrum, optimism, baseSepolia]

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
})

// 3. Configure metadata
const appUrl =
  typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://bobbyprotocol.xyz';

// What the wallet shows in its approval sheet. It MUST match the site the user
// is on: a foreign name or icon in the prompt is the exact signal people are
// taught to treat as phishing (security review 2026-09-03).
export const metadata = {
  name: 'Bobby Protocol',
  description: 'Refuted before execution. Bobby never holds funds or keys.',
  url: appUrl,
  icons: [`${appUrl}/apple-touch-icon-bobby-v3.png`],
};

// 4. Create modal
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  features: {
    analytics: true,
    email: false,
    socials: [],
  },
  // OKX Wallet featured first, then MetaMask, Coinbase, Trust
  featuredWalletIds: [
    '971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709', // OKX Wallet
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e18e4a0eb6f0f9a23f', // Coinbase
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust
  ],
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#10b981', // emerald-500
    '--w3m-border-radius-master': '0.5rem',
  }
})

export const config = wagmiAdapter.wagmiConfig
