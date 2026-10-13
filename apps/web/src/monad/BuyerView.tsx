import { useMemo, useRef, useState } from 'react';
import { parseEventLogs, type Abi, type Hex } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { Field } from '../ui/Field';
import { RuleRow } from '../ui/RuleRow';
import { C, DEFAULT_SB, deployed, fmtAusd, fmtDate, parseAusd, publicClient, sbHashFor } from './chain';
import { ausdAbi, engineAbi, tokenAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { knownSbNums, readInvoice, rememberSb, useRead } from './invoice';
import { useWallets, type TxResult } from './wallets';
import { monad } from './chain';

export function BuyerView({ sbHash }: { sbHash: Hex }) {
  const { slots, send, balances } = useWallets();
  const buyer = slots.buyer.address;
  const ack = useAction();
  const pay = useAction();
  const [amt, setAmt] = useState('');
  const [receipt, setReceipt] = useState<{ toPool: bigint; fee: bigint; toExporter: bigint; hash: Hex; ms: number } | null>(null);
  const { data: inv } = useRead(() => readInvoice(sbHash), [sbHash]);
  if (deployed) rememberSb(sbHash);
  // single-flight guard: a double click fires twice before React re-renders the disabled button
  const lock = useRef(false);
  const once = <T,>(fn: () => Promise<T>) => async () => {
    if (lock.current) throw new Error('Already in progress');
    lock.current = true;
    try { return await fn(); } finally { lock.current = false; }
  };
  const exporterAddr = inv?.reg.exporter;
  const sbLabel = useMemo(() => {
    if (!exporterAddr) return '';
    const cands = [...knownSbNums(exporterAddr), ...Array.from({ length: 50 }, (_, i) => DEFAULT_SB + i)];
    const n = cands.find((c) => sbHashFor(exporterAddr, c) === sbHash);
    return n ? `SB ${n}` : `${sbHash.slice(0, 10)}…`;
  }, [exporterAddr, sbHash]);

  const acked = !!inv && inv.ack.ackBlock > 0n;
  const status = inv?.pos.status ?? 0;
  const amtText = amt.trim().replace(/,/g, '');
  const payAmount = amtText ? parseAusd(amtText) : inv?.amount ?? 0n;
  const amtErr = !amtText ? null
    : !/^\d+(\.\d{1,6})?$/.test(amtText) ? 'Enter a number with at most 6 decimal places.'
    : payAmount <= 0n ? 'Amount must be greater than 0.'
    : inv && payAmount > inv.amount ? `Amount cannot exceed the invoice (${fmtAusd(inv.amount)} AUSD).`
    : null;

  async function acknowledge() {
    if (!inv) return;
    const fresh = (await publicClient.readContract({ address: C.token, abi: tokenAbi, functionName: 'acks', args: [sbHash] })) as readonly unknown[];
    if ((fresh[3] as bigint) > 0n) throw new Error('This invoice is already acknowledged.');
    const amount = inv.reg.fobMinor * 10_000n;
    const dueDate = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
    const { client } = slots.buyer;
    const sig = await client.signTypedData({
      account: client.account!,
      domain: { name: 'Hisab', version: '1', chainId: monad.id, verifyingContract: C.token },
      types: { Acknowledgement: [{ name: 'sbHash', type: 'bytes32' }, { name: 'buyer', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'dueDate', type: 'uint64' }] },
      primaryType: 'Acknowledgement',
      message: { sbHash, buyer, amount, dueDate },
    });
    return send('buyer', { address: C.token, abi: tokenAbi as Abi, functionName: 'acknowledge', args: [sbHash, buyer, amount, dueDate, sig] });
  }

  async function doPay(): Promise<TxResult> {
    if (amtErr) throw new Error(amtErr);
    const [bal, allowance] = (await Promise.all([
      publicClient.readContract({ address: C.ausd, abi: ausdAbi, functionName: 'balanceOf', args: [buyer] }),
      publicClient.readContract({ address: C.ausd, abi: ausdAbi, functionName: 'allowance', args: [buyer, C.engine] }),
    ])) as [bigint, bigint];
    if (bal < payAmount) await send('buyer', { address: C.ausd, abi: ausdAbi as Abi, functionName: 'mint', args: [buyer, payAmount - bal] }); // only the shortfall
    if (allowance < payAmount) await send('buyer', { address: C.ausd, abi: ausdAbi as Abi, functionName: 'approve', args: [C.engine, payAmount] });
    const r = await send('buyer', { address: C.engine, abi: engineAbi as Abi, functionName: 'pay', args: [sbHash, payAmount] });
    const ev = parseEventLogs({ abi: engineAbi, logs: r.receipt.logs, eventName: 'Paid' })[0];
    if (ev) setReceipt({ toPool: ev.args.toPool, fee: ev.args.fee, toExporter: ev.args.toExporter, hash: r.hash, ms: r.ms });
    return r;
  }

  const q = inv?.quote;
  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4">
      {!deployed && <NotDeployed />}
      <Panel raised title="Pay invoice" action={inv ? <Stamp state={inv.statusName} tone={inv.statusName === 'DEFAULTED' ? 'danger' : undefined} /> : undefined}>
        {inv ? (
          <div>
            <RuleRow label="Shipping bill" value={<span className="font-display font-semibold">{sbLabel}</span>} />
            <RuleRow label="Amount due" value={<span className="font-mono tabular text-lg font-semibold">{fmtAusd(inv.amount)} AUSD</span>} />
            <RuleRow label="Due date" value={<span className="font-mono tabular">{acked ? fmtDate(inv.ack.dueDate) : 'set at acknowledgement (+30 days)'}</span>} />
            <RuleRow label="Buyer wallet" value={<span className="font-mono tabular text-xs">{buyer}</span>} />
            <RuleRow label="Your AUSD" value={<span className="font-mono tabular">{fmtAusd(balances.buyer.ausd)}</span>} />
            {inv.pos.shortfall > 0n && <RuleRow label="Shortfall" value={<span className="font-mono tabular text-danger">{fmtAusd(inv.pos.shortfall)} AUSD</span>} />}
          </div>
        ) : <Empty message={deployed ? 'Invoice not found. Check the link or load the demo invoice from the Exporter tab.' : 'Not deployed'} />}
      </Panel>

      {inv && (
        <Panel title="1. Acknowledge">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Sign the invoice (EIP-712) with the buyer wallet. This lets the exporter finance it.</p>
            <div><ActionButton label="Acknowledge" busy={ack.busy} disabled={acked} onClick={() => ack.run('Acknowledge', once(acknowledge) as () => Promise<TxResult>)} /></div>
            {acked && <p className="text-sm text-accent-text">Acknowledged at block {inv.ack.ackBlock.toString()}.</p>}
            {ack.err && <ErrorBanner {...ack.err} />}
            {ack.tx && <TxLink hash={ack.tx.hash} ms={ack.tx.ms} />}
          </div>
        </Panel>
      )}

      {inv && (
        <Panel title="2. Pay">
          <div className="flex flex-col gap-3">
            <Field label="Amount (AUSD)" helper="Leave empty to pay the full amount. Less than the invoice amount is a short pay.">
              <input className="h-9 w-full rounded-[var(--radius-ui)] border border-line bg-sunken px-3 font-mono tabular text-sm text-text" placeholder={fmtAusd(inv.amount).replace(/,/g, '')} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" />
            </Field>
            {amtErr && <p className="text-sm text-danger">{amtErr}</p>}
            {q && (
              <div>
                <RuleRow label="Pool: principal + interest" value={<span className="font-mono tabular">{fmtAusd(q.toPool)}</span>} />
                <RuleRow label="of which interest" value={<span className="font-mono tabular">{fmtAusd(q.interest)}</span>} />
                <RuleRow label="Platform fee" value={<span className="font-mono tabular">{fmtAusd(q.fee)}</span>} />
                <RuleRow label="Exporter balance" value={<span className="font-mono tabular">{fmtAusd(q.toExporter)}</span>} />
                <p className="pt-1 text-xs text-faint">Preview for the full amount, at the current time.</p>
              </div>
            )}
            <div><ActionButton label="Pay" busy={pay.busy} disabled={status !== 1 || !!amtErr} onClick={() => pay.run('Pay', once(doPay))} /></div>
            {status === 0 && <p className="text-sm text-muted">Not financed yet, nothing to pay.</p>}
            {pay.err && <ErrorBanner {...pay.err} />}
            {receipt && (
              <div>
                <RuleRow label="Paid to pool" value={<span className="font-mono tabular">{fmtAusd(receipt.toPool)}</span>} />
                <RuleRow label="Fee" value={<span className="font-mono tabular">{fmtAusd(receipt.fee)}</span>} />
                <RuleRow label="To exporter" value={<span className="font-mono tabular">{fmtAusd(receipt.toExporter)}</span>} />
                <div className="pt-2"><TxLink hash={receipt.hash} ms={receipt.ms} /></div>
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
