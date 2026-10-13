import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createWalletClient, custom, http, type Abi, type Address, type Hex, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { C, deployed, errMessage, monad, publicClient } from './chain';
import { ausdAbi } from './abi';
import { privyEnabled } from './privyEnv';
import type { PrivyApi, PrivyState } from './privy';
import { useToast } from '../components/Toasts';

export type Role = 'lender' | 'exporter' | 'buyer';
export const ROLES: Role[] = ['lender', 'exporter', 'buyer'];

export type SlotKind = 'burner' | 'browser' | 'privy';
/** `browser` is kept for existing callers (true only for an injected browser wallet). */
interface Slot { address: Address; client: WalletClient; browser: boolean; kind: SlotKind; email?: string; /** privy only: false until the embedded wallet's provider is attached */ live?: boolean }
interface Bal { mon?: bigint; ausd?: bigint }
export interface TxResult { hash: Hex; ms: number; receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> }
interface Ctx {
  slots: Record<Role, Slot>;
  balances: Record<Role, Bal>;
  tick: number;
  refresh: () => void;
  connectBrowser: (r: Role) => Promise<void>;
  /** Privy email login state; `enabled` is false when VITE_PRIVY_APP_ID is unset (burners only). */
  privy: { enabled: boolean; ready: boolean; authenticated: boolean; email?: string };
  /** Bind the Privy embedded wallet to a role (opens the email login first when needed). One role at a time. */
  bindEmail: (r: Role) => Promise<void>;
  /** Revert a role to its burner wallet (privy / browser wallets are only detached, not deleted). */
  unbind: (r: Role) => void;
  /** Privy logout; privy-backed roles fall back to their burners. */
  logoutEmail: () => Promise<void>;
  /** New burner wallets for every burner-backed role (privy and browser bindings are left alone). */
  freshBurners: () => void;
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
  return { address: account.address, browser: false, kind: 'burner', client: createWalletClient({ account, chain: monad, transport: http() }) };
};

const bindKey = (r: Role) => `hisab-monad-privy-${r}`;
const readBind = (r: Role): Address | null => { try { return localStorage.getItem(bindKey(r)) as Address | null; } catch { return null; } };
const writeBind = (r: Role, a: Address | null) => { try { a ? localStorage.setItem(bindKey(r), a) : localStorage.removeItem(bindKey(r)); } catch { /* storage unavailable */ } };

/** Stand-in for a persisted email binding until Privy has restored the session; any write fails with a clear message. */
const mkPendingPrivy = (address: Address): Slot => ({
  address, browser: false, kind: 'privy', live: false,
  client: createWalletClient({ account: address, chain: monad, transport: custom({ request: async () => { throw new Error('Email wallet is still connecting, try again in a moment'); } }) }),
});

const PrivyBridge = lazy(() => import('./privy').then((m) => ({ default: m.PrivyBridge })));

export function WalletProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Record<Role, Slot>>(() => {
    const out = {} as Record<Role, Slot>;
    for (const r of ROLES) { const b = privyEnabled ? readBind(r) : null; out[r] = b ? mkPendingPrivy(b) : mkBurner(r); }
    return out;
  });
  const toast = useToast();
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const apiRef = useRef<PrivyApi | null>(null);
  const [pv, setPv] = useState<PrivyState>({ ready: false, authenticated: false });
  const pvRef = useRef(pv);
  pvRef.current = pv;
  const [want, setWant] = useState<Role | null>(null);
  const [balances, setBalances] = useState<Record<Role, Bal>>({ lender: {}, exporter: {}, buyer: {} });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const loading = useRef(false);
  useEffect(() => {
    if (loading.current) return; // never stack balance reads behind a slow RPC
    loading.current = true;
    let live = true;
    (async () => {
      const entries = await Promise.all(ROLES.map(async (r) => {
        const a = slots[r].address;
        const [mon, ausd] = await Promise.all([
          publicClient.getBalance({ address: a }).catch(() => undefined),
          deployed ? (publicClient.readContract({ address: C.ausd, abi: ausdAbi, functionName: 'balanceOf', args: [a] }) as Promise<bigint>).catch(() => undefined) : undefined,
        ]);
        return [r, { mon, ausd }] as const;
      }));
      // an RPC error leaves the previous value in place instead of blanking the bar
      if (live) setBalances((prev) => { const n = { ...prev }; for (const [r, b] of entries) n[r] = { mon: b.mon ?? prev[r].mon, ausd: b.ausd ?? prev[r].ausd }; return n; });
    })().finally(() => { loading.current = false; });
    return () => { live = false; };
  }, [slots, tick]);

  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, 5000);
    return () => clearInterval(id);
  }, []);

  // Sync Privy -> role slots: bind the wanted role, restore persisted bindings, drop them on logout / different email.
  useEffect(() => {
    if (!privyEnabled || !pv.ready) return;
    const revert = (r: Role) => { writeBind(r, null); setSlots((s) => (s[r].kind === 'privy' ? { ...s, [r]: mkBurner(r) } : s)); };
    if (!pv.authenticated) { ROLES.forEach((r) => { if (slotsRef.current[r].kind === 'privy' || readBind(r)) revert(r); }); return; }
    if (!pv.address) return; // embedded wallet still being created
    const address = pv.address;
    const lower = address.toLowerCase();
    const targets = want ? [want] : ROLES.filter((r) => readBind(r)?.toLowerCase() === lower);
    ROLES.forEach((r) => { if (!targets.includes(r) && (slotsRef.current[r].kind === 'privy' || readBind(r))) revert(r); });
    let cancelled = false;
    for (const r of targets) {
      const cur = slotsRef.current[r];
      if (cur.kind === 'privy' && cur.live && cur.address.toLowerCase() === lower) { if (want === r) setWant(null); continue; }
      apiRef.current!.client().then((client) => {
        if (cancelled) return;
        writeBind(r, address);
        setSlots((s) => ({ ...s, [r]: { address, client, browser: false, kind: 'privy', email: pv.email, live: true } }));
        setWant((w) => (w === r ? null : w));
      }).catch((e) => { if (!cancelled) { setWant(null); toast.push('error', `Email wallet: ${errMessage(e).text}`); } });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv, want]);

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
    writeBind(r, null);
    setSlots((s) => ({ ...s, [r]: { address, client, browser: true, kind: 'browser' } }));
  }, []);

  const send: Ctx['send'] = useCallback(
    async (r, req) => {
      const { client, address } = slots[r];
      const t0 = performance.now();
      const hash = await client.writeContract({ ...req, account: client.account ?? address, chain: monad } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      const ms = Math.round(performance.now() - t0);
      if (receipt.status !== 'success') throw new Error(`Transaction reverted (${hash})`);
      setTick((t) => t + 1);
      return { hash, ms, receipt };
    },
    [slots],
  );

  const bindEmail = useCallback(async (r: Role) => {
    const api = apiRef.current;
    if (!privyEnabled || !api || !pvRef.current.ready) throw new Error('Email login is not available (Privy not configured or still loading)');
    setWant(r);
    if (!pvRef.current.authenticated) api.login();
  }, []);
  const unbind = useCallback((r: Role) => {
    writeBind(r, null);
    setWant((w) => (w === r ? null : w));
    setSlots((s) => (s[r].kind === 'burner' ? s : { ...s, [r]: mkBurner(r) }));
  }, []);
  const logoutEmail = useCallback(async () => { await apiRef.current?.logout(); }, []);
  const freshBurners = useCallback(() => {
    setSlots((s) => {
      const n = { ...s };
      for (const r of ROLES) if (s[r].kind === 'burner') { try { localStorage.removeItem(key(r)); } catch { /* ignore */ } n[r] = mkBurner(r); }
      return n;
    });
  }, []);

  const privy = useMemo(() => ({ enabled: privyEnabled, ready: pv.ready, authenticated: pv.authenticated, email: pv.email }), [pv]);
  const value = useMemo(
    () => ({ slots, balances, tick, refresh, connectBrowser, privy, bindEmail, unbind, logoutEmail, freshBurners, send }),
    [slots, balances, tick, refresh, connectBrowser, privy, bindEmail, unbind, logoutEmail, freshBurners, send],
  );
  return (
    <WalletCtx.Provider value={value}>
      {privyEnabled && <Suspense fallback={null}><PrivyBridge onState={setPv} apiRef={apiRef} /></Suspense>}
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallets(): Ctx {
  const c = useContext(WalletCtx);
  if (!c) throw new Error('WalletProvider missing');
  return c;
}
