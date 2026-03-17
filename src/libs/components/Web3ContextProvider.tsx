// src/libs/components/Web3ContextProvider.tsx
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/config/reown'

interface Web3ContextProviderProps {
  children: React.ReactNode;
}

const queryClient = new QueryClient()

export default function Web3ContextProvider({ children }: Web3ContextProviderProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
