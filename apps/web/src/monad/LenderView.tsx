import { useState, type ReactNode } from 'react';
import type { Abi } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { Highlight, InkBar, InkBox } from './doodle';
import { Field } from '../ui/Field';
import { RuleRow } from '../ui/RuleRow';
import { C, exactAusd, fmtAusd, parseAusd, publicClient } from './chain';
import { ausdAbi, poolAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { knownSb, readInvoice, useRead } from './invoice';
import { useWallets } from './wallets';
import { deployed } from './chain';

const inputCls = 'h-10 w-full px-3 tabular text-sm';

function Unit({ children }: { children: string }) {
  return <span className="ml-1.5 font-mono text-xs font-medium text-muted">{children}</span>;
}

function Big({ label, children, delay, title }: { label: string; children: ReactNode; delay: number; title?: string }) {
  return (
    <InkBox className="px-4 py-3" delay={delay} shadow>
      <div className="d-hand text-[18px] text-muted">{label}</div>
      <div className="mt-0.5 break-words font-display text-[clamp(26px,4.2vw,38px)] leading-[1.1] tabular text-text" title={title}>{children}</div>
    </InkBox>
  );
}

export function LenderView() {
  const { slots, send } = useWallets();
  const me = slots.lender.address;
  const [amt, setAmt] = useState('100000');
  const [wd, setWd] = useState('1000');
  const a = useAction();

  const { data: s } = useRead(async () => {
    const r = (fn: string, args: unknown[] = []) => publicClient.readContract({ address: C.pool, abi: poolAbi, functionName: fn, args } as never) as Promise<bigint>;
    const [total, idle, out, price, shares] = await Promise.all([r('totalAssets'), r('idle'), r('outstandingPrincipal'), r('convertToAssets', [1_000_000n]), r('balanceOf', [me])]);
    const mine = await r('convertToAssets', [shares]);
    return { total, idle, out, price, shares, mine };
  }, [me]);

  const { data: funded } = useRead(async () => {
    const out = [];
    for (const h of knownSb()) {
      const i = await readInvoice(h);
      if (i && i.pos.status) out.push(i);
    }
    return out;
  }, []);

  const util = s && s.total > 0n ? Number((s.out * 10000n) / s.total) / 100 : 0;
  const w = (address: typeof C.pool, abi: Abi, functionName: string, args: unknown[]) => send('lender', { address, abi, functionName, args });

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-2">
      {!deployed && <div className="md:col-span-2"><NotDeployed /></div>}
      <div className="md:col-span-2">
        {s ? (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Big label="Total assets" delay={0}>{fmtAusd(s.total)}<Unit>AUSD</Unit></Big>
              <Big label="Share price" delay={0.1} title={exactAusd(s.price)}><Highlight>{exactAusd(s.price)}</Highlight><Unit>AUSD</Unit></Big>
              <Big label="Your position" delay={0.2}>{fmtAusd(s.mine)}<Unit>AUSD</Unit></Big>
            </div>
            <InkBox className="px-4 py-3" delay={0.3}>
              <div className="d-hand text-[17px] text-muted">Utilisation</div>
              <InkBar value={util / 100} label={`${util.toFixed(2)}%`} className="mt-1" />
              <div className="mt-2 grid gap-x-6 sm:grid-cols-3">
                <RuleRow label="Idle" value={<span className="font-mono tabular">{fmtAusd(s.idle)} AUSD</span>} />
                <RuleRow label="Outstanding principal" value={<span className="font-mono tabular">{fmtAusd(s.out)} AUSD</span>} />
                <RuleRow label="Your shares" value={<span className="font-mono tabular">{fmtAusd(s.shares)} hPOOL</span>} />
              </div>
            </InkBox>
          </div>
        ) : <Panel title="Pool"><Empty message="Pool figures appear once the contracts are deployed." /></Panel>}
      </div>

      <Panel title="Lender actions">
        <div className="flex flex-col gap-3">
          <Field label="Amount (AUSD)"><input className={inputCls} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" /></Field>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Mint test AUSD" variant="secondary" busy={a.busy} onClick={() => a.run('Mint test AUSD', () => w(C.ausd, ausdAbi as Abi, 'mint', [me, parseAusd(amt)]))} />
            <ActionButton label="Deposit" busy={a.busy} onClick={() => a.run('Deposit', async () => {
              const v = parseAusd(amt);
              await w(C.ausd, ausdAbi as Abi, 'approve', [C.pool, v]);
              return w(C.pool, poolAbi as Abi, 'deposit', [v, me]);
            })} />
          </div>
          <Field label="Withdraw (AUSD)" helper="Capped at idle liquidity."><input className={inputCls} value={wd} onChange={(e) => setWd(e.target.value)} inputMode="decimal" /></Field>
          <div><ActionButton label="Withdraw" variant="secondary" busy={a.busy} onClick={() => a.run('Withdraw', () => w(C.pool, poolAbi as Abi, 'withdraw', [parseAusd(wd), me, me]))} /></div>
          {a.err && <ErrorBanner {...a.err} />}
          {a.tx && <TxLink hash={a.tx.hash} ms={a.tx.ms} />}
        </div>
      </Panel>

      <div>
        <Panel title="Funded invoices">
          {funded && funded.length ? (
            <div className="grid gap-3">
              {funded.map((i, n) => (
                <InkBox key={i.sbHash} stroke={2.5} delay={0.1 * n} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
                  <span className="font-mono text-xs">{i.sbHash.slice(0, 10)}…</span>
                  <span className="font-mono tabular text-sm">{fmtAusd(i.pos.principal)} AUSD <span className="text-muted">at</span> {(i.pos.aprBps / 100).toFixed(2)}%</span>
                  <Stamp state={i.statusName} tone={i.statusName === 'DEFAULTED' ? 'danger' : undefined} />
                </InkBox>
              ))}
            </div>
          ) : <Empty message="No funded invoices yet. Finance one from the Exporter tab." />}
        </Panel>
      </div>
    </div>
  );
}
