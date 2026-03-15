import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { AdamsChat } from './components/AdamsChat';

const queryClient = new QueryClient();

function AdamsPage() {
  return (
    <div className="flex flex-col h-screen" style={{ background: '#0a0a0a' }}>
      <DisclaimerBanner />
      <div className="flex-1 min-h-0">
        <AdamsChat />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="*" element={<AdamsPage />} />
        </Routes>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
