import type { Abi, Address, Hex } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { RuleRow } from '../ui/RuleRow';
import { InkCheck, InkCircle, InkLine } from './doodle';
import { C, GRACE, deployed, fmtAusd, fmtDate, publicClient, sbHashFor } from './chain';
import { engineAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { knownSb, readInvoice, useRead, type Invoice } from './invoice';
import { useWallets } from './wallets';

/** Find the tx for sbHash among the logs of one contract in one exact block. */
async function findTx(address: Address, block: bigint, sbHash: Hex): Promise<Hex | undefined> {
  const logs = await publicClient.getLogs({ address, fromBlock: block, toBlock: block });
  const needle = sbHash.slice(2).toLowerCase();
  const hit = logs.find((l) => (l.topics as string[]).includes(sbHash) || l.data.toLowerCase().includes(needle));
  return hit?.transactionHash;
}

async function timeline(i: Invoice) {
  const steps: { label: string; block: bigint; address: Address }[] = [
    { label: 'Registered', block: i.mintedBlock, address: C.token },
    { label: 'Acknowledged', block: i.ack.ackBlock, address: C.token },
    { label: 'Financed', block: i.pos.financedBlock, address: C.engine },
    { label: i.pos.status === 4 ? 'Defaulted' : i.pos.status === 3 ? 'Paid (short)' : 'Paid', block: i.pos.settledBlock, address: C.engine },
  ];
  return Promise.all(steps.map(async (s) => ({ ...s, done: s.block > 0n, hash: s.block > 0n ? await findTx(s.address, s.block, i.sbHash).catch(() => undefined) : undefined })));
}

function InvoiceTimeline({ i }: { i: Invoice }) {
  const { send } = useWallets();
  const dflt = useAction();
  const { data: steps } = useRead(() => timeline(i), [i.sbHash, i.mintedBlock, i.ack.ackBlock, i.pos.financedBlock, i.pos.settledBlock]);
  const overdue = i.pos.status === 1 && Date.now() / 1000 > Number(i.pos.dueDate) + GRACE;
  return (
    <Panel title={<span className="font-display">SB 6674321 <span className="font-mono text-xs text-faint">{i.sbHash.slice(0, 10)}…</span></span>} action={<Stamp state={i.statusName} tone={i.statusName === 'DEFAULTED' ? 'danger' : undefined} />}>
      <RuleRow label="Amount" value={<span className="font-mono tabular">{fmtAusd(i.amount)} AUSD</span>} />
      {i.pos.shortfall > 0n && <RuleRow label="Shortfall" value={<span className="font-mono tabular text-danger">{fmtAusd(i.pos.shortfall)} AUSD</span>} />}
      {steps && (
        <ol className="relative mt-3 grid gap-4 py-1">
          <div className="absolute bottom-4 left-[17px] top-4 w-3 -translate-x-1/2" aria-hidden="true"><InkLine vertical stroke={3} thickness={12} delay={0.2} bend={3} /></div>
          {steps.map((s, n) => (
            <li key={s.label} className="relative flex items-start gap-3">
              <span className="bg-raised py-0.5"><InkCircle size={36} stroke={3} dashed={!s.done} delay={0.3 + 0.15 * n} className="font-mono text-sm font-bold">{n + 1}</InkCircle></span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className={`font-display text-base ${s.done ? '' : 'text-muted'}`}>{s.label}</span>
                  {s.done && <InkCheck size={22} delay={0.6 + 0.15 * n} />}
                </div>
                {s.done ? (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono tabular text-xs text-muted">block {s.block.toString()}</span>
                    {s.hash ? <TxLink hash={s.hash} /> : <span className="text-xs text-faint">tx not found</span>}
                  </div>
                ) : <span className="d-hand text-[16px] text-muted">not yet</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {i.pos.status === 1 && (
        <div className="flex flex-col gap-2 pt-3">
          <ActionButton label="Mark default" variant="danger" busy={dflt.busy} disabled={!overdue} onClick={() => dflt.run('Mark default', () => send('lender', { address: C.engine, abi: engineAbi as Abi, functionName: 'markDefault', args: [i.sbHash] }))} />
          {!overdue && <span className="text-xs text-muted">Available after {fmtDate(Number(i.pos.dueDate) + GRACE)} (due date plus 15 days grace).</span>}
          {dflt.err && <ErrorBanner {...dflt.err} />}
          {dflt.tx && <TxLink hash={dflt.tx.hash} ms={dflt.tx.ms} />}
        </div>
      )}
    </Panel>
  );
}

export function ExplorerView() {
  const { slots } = useWallets();
  const exporterHash = sbHashFor(slots.exporter.address);
  const { data: list } = useRead(async () => {
    const hashes = Array.from(new Set([exporterHash, ...knownSb()]));
    return (await Promise.all(hashes.map((h) => readInvoice(h)))).filter((x): x is Invoice => !!x);
  }, [exporterHash]);
  return (
    <div className="mx-auto grid max-w-3xl gap-4 p-4">
      {!deployed && <NotDeployed />}
      {list && list.length ? list.map((i) => <InvoiceTimeline key={i.sbHash} i={i} />) : <Empty message="No invoices yet. Load the demo invoice from the Exporter tab." />}
    </div>
  );
}
