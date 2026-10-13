import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createWalletClient, custom, http, type Abi, type Address, type Hex, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { C, deployed, monad, publicClient } from './chain';
import { ausdAbi } from './abi';

export type Role = 'lender' | 'exporter' | 'buyer';
export const ROLES: Role[] = ['lender', 'exporter', 'buyer'];

interface Slot { address: Address; client: WalletClient; browser: boolean }
interface Bal { mon?: bigint; ausd?: bigint }
export interface TxResult { hash: Hex; ms: number; receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> }
interface Ctx {
  slots: Record<Role, Slot>;
  balances: Record<Role, Bal>;
  tick: number;
  refresh: () => void;
  connectBrowser: (r: Role) => Promise<void>;
  /** send a contract write from a role's wallet, wait for the receipt, time it */
  send: (r: Role, req: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }) => Promise<TxResult>;
}

const WalletCtx = createContext<Ctx | null>(null);
const key = (r: Role) => `hisab-monad-key-${r}`;

function burner(r: Role): PrivateKeyAccount {
  let pk: string | null = null;
  try { pk = localStorage.getItem(key(r)); } catch { /* storage unavailable */ }
  if (!pk) {
    pk = generatePrivateKey();
    try { localStorage.setItem(key(r), pk); } catch { /* ephemeral burner */ }
  }
  return privateKeyToAccount(pk as Hex);
}

const mkBurner = (r: Role): Slot => {
  const account = burner(r);
  return { address: account.address, browser: false, client: createWalletClient({ account, chain: monad, transport: http() }) };
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<Role, Slot>>(() => {
    const out = {} as Record<Role, Slot>;
    for (const r of ROLES) out[r] = mkBurner(r);
    return out;
  });
  const [balances, setBalances] = useState<Record<Role, Bal>>({ lender: {}, exporter: {}, buyer: {} });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const next = {} as Record<Role, Bal>;
      for (const r of ROLES) {
        const a = slots[r].address;
        const mon = await publicClient.getBalance({ address: a }).catch(() => undefined);
        const ausd = deployed ? await publicClient.readContract({ address: C.ausd, abi: ausdAbi, functionName: 'balanceOf', args: [a] }).catch(() => undefined) : undefined;
        next[r] = { mon, ausd };
      }
      if (live) setBalances(next);
    };
    load();
    return () => { live = false; };
  }, [slots, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const connectBrowser = useCallback(async (r: Role) => {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) throw new Error('No browser wallet found');
    const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[];
    const chainIdHex = `0x${monad.id.toString(16)}`;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    } catch {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: chainIdHex, chainName: monad.name, nativeCurrency: monad.nativeCurrency, rpcUrls: monad.rpcUrls.default.http, blockExplorerUrls: [monad.blockExplorers.default.url] }],
      });
    }
    const client = createWalletClient({ account: address, chain: monad, transport: custom(eth as never) });
    setSlots((s) => ({ ...s, [r]: { address, client, browser: true } }));
  }, []);

  const send: Ctx['send'] = useCallback(
    async (r, req) => {
      const { client, address } = slots[r];
      const t0 = performance.now();
      const hash = await client.writeContract({ ...req, account: client.account ?? address, chain: monad } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const ms = Math.round(performance.now() - t0);
      if (receipt.status !== 'success') throw new Error(`Transaction reverted (${hash})`);
      setTick((t) => t + 1);
      return { hash, ms, receipt };
    },
    [slots],
  );

  const value = useMemo(() => ({ slots, balances, tick, refresh, connectBrowser, send }), [slots, balances, tick, refresh, connectBrowser, send]);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallets(): Ctx {
  const c = useContext(WalletCtx);
  if (!c) throw new Error('WalletProvider missing');
  return c;
}
