import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { txUrl } from './chain';
import { Button } from '../ui/Button';
import { useToast } from '../components/Toasts';
import { errMessage } from './chain';
import type { TxResult } from './wallets';

export function TxLink({ hash, ms }: { hash: string; ms?: number }) {
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono tabular text-xs">
      {hash.slice(0, 10)}…{hash.slice(-6)} <ArrowSquareOut size={12} />
      {ms !== undefined && <span className="ml-1 text-muted no-underline">confirmed in {ms} ms</span>}
    </a>
  );
}

export function ErrorBanner({ text, name }: { text: string; name?: string }) {
  return (
    <motion.div role="alert" animate={name ? { x: [0, -6, 6, -6, 6, 0] } : undefined} transition={{ duration: 0.3 }} className="rounded-[var(--radius-ui)] border-[2.5px] border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {name ? <span className="font-mono font-semibold">{name}</span> : null}
      {name ? ': ' : ''}
      {name ? 'the contract refused this call.' : text}
    </motion.div>
  );
}

/** Run an async action with loading + error capture. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ name?: string; text: string } | null>(null);
  const [tx, setTx] = useState<Pick<TxResult, 'hash' | 'ms'> | null>(null);
  async function run(label: string, fn: () => Promise<TxResult | void>) {
    setBusy(label); setErr(null);
    try {
      const r = await fn();
      if (r) setTx({ hash: r.hash, ms: r.ms });
    } catch (e) {
      const m = errMessage(e);
      setErr(m);
      if (!m.name) toast.push('error', m.text);
    } finally { setBusy(null); }
  }
  return { busy, err, tx, run, setErr };
}

export function ActionButton({ label, busy, onClick, variant = 'primary', disabled }: { label: string; busy: string | null; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  return <Button variant={variant} loading={busy === label} disabled={disabled || (busy !== null && busy !== label)} onClick={onClick}>{label}</Button>;
}

export function NotDeployed() {
  return <div className="d-hand rounded-[var(--radius-ui)] border-2 border-dashed border-line-strong px-4 py-3 text-[17px] text-muted">Contracts are not deployed yet (deployments.json holds placeholder zero addresses). Reads and writes are disabled.</div>;
}
