// src/components/WalletConnect.tsx
import React from 'react';
import { useAppKit } from '@reown/appkit/react'
import { useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  PixelWallet,
  PixelChevronDown,
  PixelCopy,
  PixelExternalLink,
  PixelLogOut
} from '@/components/ui/pixel-icons';
import { toast } from 'sonner';

export const WalletConnect: React.FC = () => {
  const { open } = useAppKit()
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()

  // Utility functions
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Dirección copiada al portapapeles');
    }
  };

  const getChainName = (chainId?: number) => {
    if (!chainId) return 'Unknown';
    switch (chainId) {
      case 1: return 'Ethereum';
      case 137: return 'Polygon';
      case 42161: return 'Arbitrum';
      case 10: return 'Optimism';
      case 8453: return 'Base';
      case 196: return 'X Layer';
      default: return `Chain ${chainId}`;
    }
  };

  const openExplorer = () => {
    if (address && chain) {
      const baseUrl = chain.blockExplorers?.default.url || 'https://etherscan.io';
      window.open(`${baseUrl}/address/${address}`, '_blank');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success('Wallet desconectada');
  };

  // If wallet is connected, show connected state
  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <PixelWallet size={16} />
            <span className="hidden sm:inline">{formatAddress(address)}</span>
            <span className="sm:hidden">Wallet</span>
            {chain && (
              <span className="hidden md:inline text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                {getChainName(chain.id)}
              </span>
            )}
            <PixelChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-3 py-2 border-b">
            <p className="text-sm font-medium">Wallet Conectada</p>
            <p className="text-xs text-muted-foreground">{address}</p>
            {chain && (
              <p className="text-xs text-muted-foreground mt-1">
                Red: {chain.name}
              </p>
            )}
          </div>

          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyAddress}
              className="w-full justify-start"
            >
              <PixelCopy size={16} className="mr-2" />
              Copiar dirección
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={openExplorer}
              className="w-full justify-start"
            >
              <PixelExternalLink size={16} className="mr-2" />
              Ver en Explorer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => open()}
              className="w-full justify-start"
            >
              <PixelWallet size={16} className="mr-2" />
              Cambiar Wallet
            </Button>
          </div>

          <DropdownMenuSeparator />

          <div className="p-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              className="w-full justify-start"
            >
              <PixelLogOut size={16} className="mr-2" />
              Desconectar
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // If wallet is not connected, show connect button
  return (
    <Button
      size="sm"
      className="flex items-center gap-2"
      onClick={() => open()}
    >
      <PixelWallet size={16} />
      <span className="hidden sm:inline">Conectar Wallet</span>
      <span className="sm:hidden">Wallet</span>
    </Button>
  );
};