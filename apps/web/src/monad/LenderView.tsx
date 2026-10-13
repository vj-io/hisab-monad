import { useState } from 'react';
import type { Abi } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { Field } from '../ui/Field';
import { RuleRow } from '../ui/RuleRow';
import { C, exactAusd, fmtAusd, parseAusd, publicClient } from './chain';
import { ausdAbi, poolAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { knownSb, readInvoice, useRead } from './invoice';
import { useWallets } from './wallets';
import { deployed } from './chain';

const inputCls = 'h-9 w-full rounded-[var(--radius-ui)] border border-line bg-sunken px-3 font-mono tabular text-sm text-text';

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
      <Panel title="Pool">
        {s ? (
          <div>
            <RuleRow label="Total assets" value={<span className="font-mono tabular">{fmtAusd(s.total)} AUSD</span>} />
            <RuleRow label="Idle" value={<span className="font-mono tabular">{fmtAusd(s.idle)} AUSD</span>} />
            <RuleRow label="Outstanding principal" value={<span className="font-mono tabular">{fmtAusd(s.out)} AUSD</span>} />
            <RuleRow label="Utilisation" value={<span className="font-mono tabular">{util.toFixed(2)}%</span>} />
            <RuleRow label="Share price" value={<span className="font-mono tabular" title={exactAusd(s.price)}>{exactAusd(s.price)} AUSD</span>} />
            <RuleRow label="Your shares" value={<span className="font-mono tabular">{fmtAusd(s.shares)} hPOOL</span>} />
            <RuleRow label="Your position" value={<span className="font-mono tabular">{fmtAusd(s.mine)} AUSD</span>} />
          </div>
        ) : <Empty message="Pool figures appear once the contracts are deployed." />}
      </Panel>

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

      <div className="md:col-span-2">
        <Panel title="Funded invoices">
          {funded && funded.length ? funded.map((i) => (
            <RuleRow key={i.sbHash} label={<span className="font-mono text-xs">{i.sbHash.slice(0, 10)}…</span>} value={
              <span className="flex items-center gap-3"><span className="font-mono tabular">{fmtAusd(i.pos.principal)} AUSD at {(i.pos.aprBps / 100).toFixed(2)}%</span><Stamp state={i.statusName} tone={i.statusName === 'DEFAULTED' ? 'danger' : undefined} /></span>
            } />
          )) : <Empty message="No funded invoices yet. Finance one from the Exporter tab." />}
        </Panel>
      </div>
    </div>
  );
}
