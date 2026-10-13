// Everything that imports @privy-io/react-auth lives here; it is only loaded (dynamic import) when VITE_PRIVY_APP_ID is set.
import { useEffect, type MutableRefObject, type ReactNode } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { monadTestnet } from 'viem/chains';
import { monad } from './chain';

export interface PrivyState { ready: boolean; authenticated: boolean; email?: string; address?: Address }
export interface PrivyApi {
  login: () => void;
  logout: () => Promise<void>;
  /** viem WalletClient over the embedded wallet's EIP-1193 provider, switched to Monad testnet. */
  client: () => Promise<WalletClient>;
}

export default function HisabPrivyProvider({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        appearance: { theme: 'light' },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          showWalletUIs: false, // no per-transaction confirmation modal: click-only demo
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

/** Renders nothing; mirrors Privy hook state into WalletProvider (which must also work without Privy mounted). */
export function PrivyBridge({ onState, apiRef }: { onState: (s: PrivyState) => void; apiRef: MutableRefObject<PrivyApi | null> }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const w = wallets.find((x) => x.walletClientType.startsWith('privy'));
  apiRef.current = {
    login: () => login({ loginMethods: ['email'] }),
    logout,
    client: async () => {
      if (!w) throw new Error('Email wallet not ready yet');
      await w.switchChain(monad.id); // must precede getEthereumProvider (existing providers keep the old chain)
      const provider = await w.getEthereumProvider();
      return createWalletClient({ account: w.address as Address, chain: monad, transport: custom(provider) });
    },
  };
  const email = user?.email?.address;
  const address = w?.address as Address | undefined;
  useEffect(() => { onState({ ready: ready && walletsReady, authenticated, email, address }); }, [ready, walletsReady, authenticated, email, address, onState]);
  return null;
}
