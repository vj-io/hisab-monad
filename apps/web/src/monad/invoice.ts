import { useEffect, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';
import { C, DEFAULT_SB, deployed, publicClient, sbHashFor, STATUS } from './chain';
import { creditAbi, engineAbi, registryAbi, tokenAbi } from './abi';
import { useWallets } from './wallets';

export interface Invoice {
  sbHash: Hex;
  reg: { exporter: Address; fobMinor: bigint; state: number };
  ack: { buyer: Address; amount: bigint; dueDate: bigint; ackBlock: bigint };
  pos: { exporter: Address; buyer: Address; amount: bigint; principal: bigint; aprBps: number; financedAt: bigint; dueDate: bigint; status: number; shortfall: bigint; financedBlock: bigint; settledBlock: bigint };
  mintedBlock: bigint;
  quote?: { toPool: bigint; interest: bigint; fee: bigint; toExporter: bigint };
  /** invoice amount in AUSD base units */
  amount: bigint;
  statusName: string;
}

const run = <T,>(p: Promise<T>) => p;

export async function readInvoice(sbHash: Hex): Promise<Invoice | null> {
  const rc = (address: Address, abi: never, functionName: string, args: unknown[]) => run(publicClient.readContract({ address, abi, functionName, args } as never) as Promise<never>);
  const [bill, ack, pos, minted] = await Promise.all([
    rc(C.registry, registryAbi as never, 'bills', [sbHash]) as Promise<readonly unknown[]>,
    rc(C.token, tokenAbi as never, 'acks', [sbHash]) as Promise<readonly unknown[]>,
    rc(C.engine, engineAbi as never, 'positions', [sbHash]) as Promise<readonly unknown[]>,
    rc(C.token, tokenAbi as never, 'mintedBlock', [BigInt(sbHash)]) as Promise<bigint>,
  ]);
  const reg = { exporter: bill[1] as Address, fobMinor: bill[2] as bigint, state: Number(bill[5]) };
  if (reg.state === 0) return null;
  const a = { buyer: ack[0] as Address, amount: ack[1] as bigint, dueDate: ack[2] as bigint, ackBlock: ack[3] as bigint };
  const p = {
    exporter: pos[0] as Address, buyer: pos[1] as Address, amount: pos[2] as bigint, principal: pos[3] as bigint, aprBps: Number(pos[4]),
    financedAt: pos[5] as bigint, dueDate: pos[6] as bigint, status: Number(pos[7]), shortfall: pos[8] as bigint, financedBlock: pos[9] as bigint, settledBlock: pos[10] as bigint,
  };
  let quote: Invoice['quote'];
  if (p.status === 1) {
    try {
      const q = (await rc(C.engine, engineAbi as never, 'quote', [sbHash])) as readonly bigint[];
      quote = { toPool: q[0], interest: q[1], fee: q[2], toExporter: q[3] };
    } catch { /* quote unavailable */ }
  }
  return { sbHash, reg, ack: a, pos: p, mintedBlock: minted, quote, amount: p.status ? p.amount : a.amount || reg.fobMinor * 10_000n, statusName: p.status ? STATUS[p.status] : 'OPEN' };
}

export async function readCredit(exporter: Address) {
  const r = (fn: string, args: unknown[]) => publicClient.readContract({ address: C.credit, abi: creditAbi, functionName: fn, args } as never) as Promise<never>;
  const [tier, rec, terms] = await Promise.all([r('tierOf', [exporter]), r('records', [exporter]), r('terms', [exporter])]);
  const t = terms as readonly [number, number, bigint];
  const x = rec as readonly [number, number, number, number, bigint, bigint];
  return { tier: Number(tier), realised: x[0], onTime: x[1], shortPaid: x[2], defaults: x[3], volume: x[4], openExposure: x[5], advanceBps: Number(t[0]), aprBps: Number(t[1]), cap: t[2] };
}

/** Poll an async reader on every wallet tick (5 s). One request in flight at a time, paused while the tab is hidden,
 *  and an RPC error keeps the last good data. Returns undefined data while loading. */
export function useRead<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error?: string } {
  const { tick } = useWallets();
  const [state, set] = useState<{ data: T | undefined; error?: string }>({ data: undefined });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const inflight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const gen = useRef(0);
  const fetchNow = () => {
    if (!deployed) { set({ data: undefined, error: 'Contracts not deployed yet' }); return; }
    const my = gen.current;
    inflight.current = true;
    fnRef.current().then(
      (d) => { if (alive.current && my === gen.current) set({ data: d }); },
      (e) => { if (alive.current && my === gen.current) set((s) => ({ data: s.data, error: String(e?.shortMessage ?? e?.message ?? e) })); },
    ).finally(() => { inflight.current = false; });
  };
  // deps changed (different invoice / wallet): drop stale results and fetch right away
  useEffect(() => { gen.current++; fetchNow(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);
  useEffect(() => {
    if (inflight.current || document.hidden) return;
    fetchNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return state;
}

const KNOWN = 'hisab-monad-known-sb';
export function knownSb(): Hex[] {
  try { return JSON.parse(localStorage.getItem(KNOWN) ?? '[]'); } catch { return []; }
}
export function rememberSb(h: Hex) {
  const l = knownSb();
  if (l.includes(h)) return;
  try { localStorage.setItem(KNOWN, JSON.stringify([...l, h])); } catch { /* ignore */ }
}

/** Bill numbers this browser knows per exporter (default SB always included, ascending). */
const numsKey = (e: Address) => `hisab-monad-sbnums-${e.toLowerCase()}`;
export function knownSbNums(exporter: Address): number[] {
  let l: number[] = [];
  try { l = JSON.parse(localStorage.getItem(numsKey(exporter)) ?? '[]'); } catch { /* ignore */ }
  return [...new Set([DEFAULT_SB, ...l.filter((n) => Number.isSafeInteger(n))])].sort((a, b) => a - b);
}
export function rememberSbNum(exporter: Address, n: number) {
  const l = knownSbNums(exporter);
  if (l.includes(n)) return;
  try { localStorage.setItem(numsKey(exporter), JSON.stringify([...l, n])); } catch { /* ignore */ }
}

/** "SB 6674322" for a bill hash, searching this exporter's known bill numbers and the demo range. */
export function sbLabelFor(exporter: Address | undefined, sbHash: Hex): string {
  if (!exporter) return `${sbHash.slice(0, 10)}…`;
  const cands = [...knownSbNums(exporter), ...Array.from({ length: 50 }, (_, i) => DEFAULT_SB + i)];
  const n = cands.find((c) => sbHashFor(exporter, c) === sbHash);
  return n ? `SB ${n}` : `${sbHash.slice(0, 10)}…`;
}
