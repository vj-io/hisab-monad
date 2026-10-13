import { useState } from 'react';
import { parseEventLogs, type Abi, type Hex } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { Field } from '../ui/Field';
import { RuleRow } from '../ui/RuleRow';
import { C, deployed, fmtAusd, fmtDate, parseAusd, publicClient } from './chain';
import { ausdAbi, engineAbi, tokenAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { readInvoice, rememberSb, useRead } from './invoice';
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

  const acked = !!inv && inv.ack.ackBlock > 0n;
  const status = inv?.pos.status ?? 0;
  const payAmount = amt ? parseAusd(amt) : inv?.amount ?? 0n;

  async function acknowledge() {
    if (!inv) return;
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
    const bal = (await publicClient.readContract({ address: C.ausd, abi: ausdAbi, functionName: 'balanceOf', args: [buyer] })) as bigint;
    if (bal < payAmount) await send('buyer', { address: C.ausd, abi: ausdAbi as Abi, functionName: 'mint', args: [buyer, payAmount - bal] });
    await send('buyer', { address: C.ausd, abi: ausdAbi as Abi, functionName: 'approve', args: [C.engine, payAmount] });
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
            <RuleRow label="Shipping bill" value={<span className="font-display font-semibold">SB 6674321</span>} />
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
            <div><ActionButton label="Acknowledge" busy={ack.busy} disabled={acked} onClick={() => ack.run('Acknowledge', acknowledge as () => Promise<TxResult>)} /></div>
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
            {q && (
              <div>
                <RuleRow label="Pool: principal + interest" value={<span className="font-mono tabular">{fmtAusd(q.toPool)}</span>} />
                <RuleRow label="of which interest" value={<span className="font-mono tabular">{fmtAusd(q.interest)}</span>} />
                <RuleRow label="Platform fee" value={<span className="font-mono tabular">{fmtAusd(q.fee)}</span>} />
                <RuleRow label="Exporter balance" value={<span className="font-mono tabular">{fmtAusd(q.toExporter)}</span>} />
                <p className="pt-1 text-xs text-faint">Preview for the full amount, at the current time.</p>
              </div>
            )}
            <div><ActionButton label="Pay" busy={pay.busy} disabled={status !== 1} onClick={() => pay.run('Pay', doPay)} /></div>
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
