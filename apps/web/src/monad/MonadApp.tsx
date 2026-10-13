import { useEffect, useState } from 'react';
import type { Hex } from 'viem';
import { Tabs } from '../ui/Tabs';
import { Button } from '../ui/Button';
import { PrivyRoleControls } from './PrivyRoleControls';
import { Hash } from '../ui/Hash';
import { useToast } from '../components/Toasts';
import { fmtAusd, fmtMon, sbHashFor } from './chain';
import { ROLES, useWallets, WalletProvider, type Role } from './wallets';
import { LenderView } from './LenderView';
import { ExporterView } from './ExporterView';
import { BuyerView } from './BuyerView';
import { ExplorerView } from './ExplorerView';
import { HandNote, HowItWorks, InkArrow, InkBox, InkLine, Highlight } from './doodle';

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
    <div className="mx-auto grid max-w-5xl gap-3 px-4 py-3 md:grid-cols-3">
      {ROLES.map((r, i) => (
        <InkBox key={r} stroke={active === r ? 4 : 3} delay={0.1 * i} className="px-3 py-2 text-xs" shadow={active === r}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-display text-base capitalize text-text">{active === r ? <Highlight delay={0.4}>{r}</Highlight> : r}</span>
            <Hash value={slots[r].address} len={4} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 font-mono tabular text-[13px] text-text">
            <span>{fmtMon(balances[r].mon)} <span className="text-muted">MON</span></span>
            <span>{fmtAusd(balances[r].ausd)} <span className="text-muted">AUSD</span></span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => faucet(r)}>Gas</Button>
            <Button size="sm" variant="ghost" onClick={() => connectBrowser(r).catch((e) => toast.push('error', e.message))}>{slots[r].browser ? 'Browser wallet' : 'Connect browser wallet'}</Button>
            <PrivyRoleControls role={r} />
          </div>
        </InkBox>
      ))}
    </div>
  );
}

const ROLE_OF: Partial<Record<MonadTab, Role>> = { lender: 'lender', exporter: 'exporter', buyer: 'buyer' };

function Console({ tab, setTab }: { tab: MonadTab; setTab: (t: MonadTab) => void }) {
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
      <header className="sticky top-0 z-40 bg-bg/95 px-4 pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-x-6 gap-y-0">
          <div className="flex shrink-0 items-end gap-1 pb-1">
            <span className="font-display text-[34px] leading-none tracking-tight text-text">Hisab</span>
            <InkArrow w={34} h={22} rotate={-12} stroke={3} className="mb-1" />
            <HandNote rotate={-4} className="pb-0.5 text-[22px] leading-none text-text">on Monad</HandNote>
          </div>
          <nav className="min-w-0 flex-1 basis-full overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] sm:basis-0">
            <Tabs groupId="monad-tabs" items={TABS} value={tab} onChange={setTab} />
          </nav>
        </div>
        <div className="mx-auto max-w-5xl"><InkLine stroke={3} thickness={10} /></div>
      </header>
      <WalletBar active={ROLE_OF[tab] ?? null} />
      {tab !== 'buyer' && tab !== 'legacy' && <HowItWorks />}
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
      <div className="min-h-screen pb-24">
        <Console tab={tab} setTab={setTab} />
      </div>
    </WalletProvider>
  );
}

export const initialTab = (): MonadTab => (payHash() ? 'buyer' : 'lender');
