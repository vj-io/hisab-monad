import { useEffect, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import type { Hex } from 'viem';
import { Tabs } from '../ui/Tabs';
import { Button } from '../ui/Button';
import { Hash } from '../ui/Hash';
import { useTheme } from '../theme';
import { useToast } from '../components/Toasts';
import { fmtAusd, fmtMon, sbHashFor } from './chain';
import { ROLES, useWallets, WalletProvider, type Role } from './wallets';
import { LenderView } from './LenderView';
import { ExporterView } from './ExporterView';
import { BuyerView } from './BuyerView';
import { ExplorerView } from './ExplorerView';

export type MonadTab = 'lender' | 'exporter' | 'buyer' | 'explorer' | 'legacy';
const TABS: { id: MonadTab; label: string }[] = [
  { id: 'lender', label: 'Lender / Pool' },
  { id: 'exporter', label: 'Exporter' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'legacy', label: 'Legacy (SWIFT)' },
];

const payHash = (): Hex | null => {
  const m = /^#\/pay\/(0x[0-9a-fA-F]{64})$/.exec(window.location.hash);
  return m ? (m[1] as Hex) : null;
};

function WalletBar({ active }: { active: Role | null }) {
  const { slots, balances, connectBrowser, refresh } = useWallets();
  const toast = useToast();
  async function faucet(r: Role) {
    const res = await fetch('/api/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: slots[r].address }) });
    const j = await res.json().catch(() => ({}));
    toast.push(res.ok ? 'success' : 'error', res.ok ? 'Gas sent' : `Faucet: ${j.error ?? res.status}`);
    refresh();
  }
  return (
    <div className="grid gap-px border-b border-line bg-line md:grid-cols-3">
      {ROLES.map((r) => (
        <div key={r} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs ${active === r ? 'bg-accent-soft' : 'bg-surface'}`}>
          <span className="w-16 font-semibold capitalize text-text">{r}</span>
          <Hash value={slots[r].address} len={4} />
          <span className="font-mono tabular text-muted">{fmtMon(balances[r].mon)} MON</span>
          <span className="font-mono tabular text-muted">{fmtAusd(balances[r].ausd)} AUSD</span>
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => faucet(r)}>Gas</Button>
            <Button size="sm" variant="ghost" onClick={() => connectBrowser(r).catch((e) => toast.push('error', e.message))}>{slots[r].browser ? 'Browser wallet' : 'Connect browser wallet'}</Button>
          </span>
        </div>
      ))}
    </div>
  );
}

const ROLE_OF: Partial<Record<MonadTab, Role>> = { lender: 'lender', exporter: 'exporter', buyer: 'buyer' };

function Console({ tab, setTab }: { tab: MonadTab; setTab: (t: MonadTab) => void }) {
  const [theme, toggleTheme] = useTheme();
  const { slots } = useWallets();
  const [hash, setHash] = useState(payHash());
  useEffect(() => {
    const on = () => { const h = payHash(); setHash(h); if (h) setTab('buyer'); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [setTab]);
  const sb = hash ?? sbHashFor(slots.exporter.address);
  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-line bg-surface/95 px-4 backdrop-blur">
        <div className="flex shrink-0 items-baseline gap-1.5 font-display text-lg font-semibold tracking-tight text-text">
          Hisab <span className="font-deva text-base text-muted">हिसाब</span> <span className="text-xs font-normal text-muted">on Monad</span>
        </div>
        <nav className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <Tabs groupId="monad-tabs" items={TABS} value={tab} onChange={setTab} />
        </nav>
        <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="shrink-0 rounded-[var(--radius-ui)] border border-line p-1.5 text-muted transition-colors hover:text-text">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <WalletBar active={ROLE_OF[tab] ?? null} />
      {tab === 'lender' && <LenderView />}
      {tab === 'exporter' && <ExporterView />}
      {tab === 'buyer' && <BuyerView sbHash={sb} />}
      {tab === 'explorer' && <ExplorerView />}
    </>
  );
}

export function MonadApp({ tab, setTab }: { tab: MonadTab; setTab: (t: MonadTab) => void }) {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-bg pb-24">
        <Console tab={tab} setTab={setTab} />
      </div>
    </WalletProvider>
  );
}

export const initialTab = (): MonadTab => (payHash() ? 'buyer' : 'lender');
