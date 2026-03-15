import { http, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';

// X Layer chain definition
const xlayer = {
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' },
  },
} as const;

export const wagmiConfig = createConfig({
  chains: [xlayer, mainnet],
  transports: {
    [xlayer.id]: http(),
    [mainnet.id]: http(),
  },
});
