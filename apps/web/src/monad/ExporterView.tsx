import { useEffect, useState } from 'react';
import type { Abi, Hex } from 'viem';
import { Panel } from '../ui/Panel';
import { Stamp } from '../ui/Stamp';
import { Empty } from '../ui/Empty';
import { RuleRow } from '../ui/RuleRow';
import { Button } from '../ui/Button';
import { Highlight, InkBox, InkCheck, InkCircle } from './doodle';
import { activeSb, C, deployed, exactAusd, fmtAusd, fmtDate, publicClient, sbHashFor, setActiveSb } from './chain';
import { engineAbi } from './abi';
import { ActionButton, ErrorBanner, NotDeployed, TxLink, useAction } from './bits';
import { knownSbNums, readCredit, readInvoice, rememberSb, rememberSbNum, useRead } from './invoice';
import { ROLES, useWallets } from './wallets';

const TIERS = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3'];

export async function eventAt(name: 'Financed' | 'Paid' | 'Defaulted', block: bigint, sbHash: Hex) {
  const event = engineAbi.find((x) => x.type === 'event' && x.name === name)!;
  const logs = await publicClient.getLogs({ address: C.engine, event, args: { sbHash }, fromBlock: block, toBlock: block } as never);
  return logs[0] as unknown as { transactionHash: Hex; args: Record<string, bigint> } | undefined;
}

export function payLink(h: Hex) {
  return `${location.origin}${location.pathname}#/pay/${h}`;
}

async function postJson(url: string, payload: unknown, label: string) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${label}: ${j.error ?? res.status}`);
  return j as { sbHash?: Hex };
}

export function ExporterView() {
  const { slots, send, refresh, freshBurners } = useWallets();
  const me = slots.exporter.address;
  const [, bump] = useState(0);
  const sbNum = activeSb(me);
  const sbNums = knownSbNums(me);
  const sbHash = sbHashFor(me, sbNum);
  const load = useAction();
  const fin = useAction();
  const again = useAction();
  const next = useAction();
  const [loadMsg, setLoadMsg] = useState('');
  const [tier0, setTier0] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(id); }, []);

  const { data: inv } = useRead(() => readInvoice(sbHash), [sbHash]);
  const { data: credit } = useRead(() => readCredit(me), [me]);
  useEffect(() => { if (credit && tier0 === null) setTier0(credit.tier); }, [credit, tier0]);
  const { data: payouts } = useRead(async () => {
    if (!inv?.pos.status) return null;
    const f = inv.pos.financedBlock ? await eventAt('Financed', inv.pos.financedBlock, sbHash) : undefined;
    const p = inv.pos.settledBlock && inv.pos.status !== 4 ? await eventAt('Paid', inv.pos.settledBlock, sbHash) : undefined;
    return { f, p };
  }, [inv?.pos.financedBlock, inv?.pos.settledBlock]);

  async function loadDemo() {
    setLoadMsg('');
    // sequential: the faucet and seed share one deployer nonce on the server
    for (const r of ROLES) await postJson('/api/faucet', { address: slots[r].address }, `faucet (${r})`);
    const j = await postJson('/api/seed', { exporter: me }, 'seed');
    const h = sbHashFor(me, 6674321);
    rememberSb(h);
    rememberSbNum(me, 6674321);
    setActiveSb(me, 6674321);
    bump((x) => x + 1);
    setLoadMsg(`Seeded ${j.sbHash ?? h}`);
    refresh();
  }

  /** PRD demo step 7: register the next shipping bill; the offer is then priced at the exporter's new tier. */
  async function registerNext() {
    const n = Math.max(...sbNums) + 1;
    await postJson('/api/seed', { exporter: me, sb: n }, 'seed');
    rememberSb(sbHashFor(me, n));
    rememberSbNum(me, n);
    setActiveSb(me, n);
    bump((x) => x + 1);
    refresh();
  }

  function freshDemo() {
    freshBurners();
    bump((x) => x + 1);
    setLoadMsg('New demo wallets created. Load the demo invoice to fund and seed them.');
  }

  const doFinance = () => send('exporter', { address: C.engine, abi: engineAbi as Abi, functionName: 'finance', args: [sbHash] }).then((r) => { rememberSb(sbHash); return r; });
  const terms = credit;
  const offer = inv && terms ? (inv.amount * BigInt(terms.advanceBps)) / 10_000n : undefined;
  const acked = !!inv && inv.ack.ackBlock > 0n;
  const status = inv?.pos.status ?? 0;
  const accrued = inv && status === 1 ? (inv.pos.principal * BigInt(inv.pos.aprBps) * BigInt(Math.max(0, now - Number(inv.pos.financedAt)))) / (365n * 86400n * 10_000n) : undefined;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-2">
      {!deployed && <div className="md:col-span-2"><NotDeployed /></div>}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <ActionButton label="Load demo invoice" busy={load.busy} onClick={() => load.run('Load demo invoice', loadDemo)} />
        <Button variant="ghost" onClick={freshDemo}>Start fresh demo</Button>
        <span className="text-xs text-muted">Funds the three wallets with gas and registers SB 6674321 for this exporter (75 days backdated, 2 on-time invoices of history).</span>
        {loadMsg && <span className="font-mono text-xs">{loadMsg}</span>}
        {load.err && <ErrorBanner {...load.err} />}
      </div>

      <Panel title="Invoice" action={inv ? <Stamp state={inv.statusName} tone={inv.statusName === 'DEFAULTED' ? 'danger' : undefined} /> : undefined}>
        {inv ? (
          <div>
            <RuleRow label="Shipping bill" value={sbNums.length > 1 ? (
              <select className="h-9 px-2 text-sm font-semibold" value={sbNum} onChange={(e) => { setActiveSb(me, Number(e.target.value)); bump((x) => x + 1); refresh(); }}>
                {sbNums.map((n) => <option key={n} value={n}>SB {n}</option>)}
              </select>
            ) : <span className="font-display font-semibold">SB {sbNum}</span>} />
            <RuleRow label="Amount" value={<span className="font-mono tabular">{fmtAusd(inv.amount)} AUSD</span>} />
            <RuleRow label="Due" value={<span className="font-mono tabular">{acked ? fmtDate(inv.ack.dueDate) : 'after buyer acknowledges'}</span>} />
            <RuleRow label="Buyer acknowledged" value={acked ? <span className="inline-flex items-center gap-1.5">Yes <InkCheck size={20} /></span> : 'No'} />
            {inv.pos.shortfall > 0n && <RuleRow label="Shortfall" value={<span className="font-mono tabular text-danger">{fmtAusd(inv.pos.shortfall)} AUSD</span>} />}
            {accrued !== undefined && <RuleRow label="Interest accruing" value={<span className="font-mono tabular">{exactAusd(accrued)} AUSD</span>} />}
            <div className="pt-3"><a className="text-sm" href={`#/pay/${sbHash}`}>Open buyer pay page</a> <span className="font-mono text-xs text-faint">{payLink(sbHash)}</span></div>
          </div>
        ) : <Empty message={deployed ? 'No invoice registered for this wallet. Load the demo invoice.' : 'Not deployed'} />}
      </Panel>

      <Panel title="Credit tier" action={credit && tier0 !== null && credit.tier !== tier0 ? <Stamp state="REALISED" label={credit.tier > tier0 ? 'Tier up' : 'Tier down'} /> : undefined}>
        {credit ? (
          <div>
            <div className="flex items-center gap-4 pb-2">
              <InkCircle size={76} stroke={4} className="font-display text-[34px] leading-none">{credit.tier}</InkCircle>
              <div className="min-w-0">
                <div className="d-hand text-[18px] leading-none text-muted">{TIERS[credit.tier]} exporter</div>
                <div className="font-display text-[26px] leading-tight tabular"><Highlight>{credit.advanceBps / 100}%</Highlight> <span className="font-mono text-xs font-medium text-muted">advance</span></div>
              </div>
            </div>
            <RuleRow label="Advance rate" value={<span className="font-mono tabular">{credit.advanceBps / 100}%</span>} />
            <RuleRow label="APR" value={<span className="font-mono tabular">{credit.aprBps / 100}%</span>} />
            <RuleRow label="Cap" value={<span className="font-mono tabular">{fmtAusd(credit.cap)} AUSD</span>} />
            <RuleRow label="Open exposure" value={<span className="font-mono tabular">{fmtAusd(credit.openExposure)} AUSD</span>} />
            <RuleRow label="Realised / on time / short" value={<span className="font-mono tabular">{credit.realised} / {credit.onTime} / {credit.shortPaid}</span>} />
            <RuleRow label="Defaults" value={<span className="font-mono tabular">{credit.defaults}</span>} />
            <RuleRow label="Volume" value={<span className="font-mono tabular">{fmtAusd(credit.volume)} AUSD</span>} />
          </div>
        ) : <Empty message="Credit record appears once deployed." />}
      </Panel>

      <Panel title="Offer" className="md:col-span-2">
        {inv && offer !== undefined && credit ? (
          <div className="flex flex-col gap-3">
            <InkBox stroke={3.5} shadow className="px-4 py-3" delay={0.2}>
              {status === 0 ? (
                <>
                  <div className="d-hand text-[18px] leading-none text-muted">Advance offer</div>
                  <div className="mt-1 font-display text-[clamp(30px,6vw,46px)] leading-none tabular"><Highlight>{fmtAusd(offer)}</Highlight><span className="ml-2 font-mono text-sm font-medium text-muted">AUSD</span></div>
                  <div className="mt-2 text-sm">{credit.advanceBps / 100}% of <span className="font-mono tabular">{fmtAusd(inv.amount)}</span> at {credit.aprBps / 100}% APR.</div>
                </>
              ) : (
                <>
                  <div className="d-hand text-[18px] leading-none text-muted">Financed advance</div>
                  <div className="mt-1 font-display text-[clamp(30px,6vw,46px)] leading-none tabular"><Highlight>{fmtAusd(inv.pos.principal)}</Highlight><span className="ml-2 font-mono text-sm font-medium text-muted">AUSD</span></div>
                  <div className="mt-2 text-sm">at {inv.pos.aprBps / 100}% APR.</div>
                </>
              )}
            </InkBox>
            {status === 0 && !acked && <p className="text-sm text-muted">Waiting for the buyer to acknowledge. Open the pay page and acknowledge, then come back.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton label="Accept offer" busy={fin.busy} disabled={status !== 0 || !acked} onClick={() => fin.run('Accept offer', doFinance)} />
              <ActionButton label="Finance again" variant="danger" busy={again.busy} disabled={status === 0} onClick={() => again.run('Finance again', doFinance)} />
            </div>
            {status >= 2 && (
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton label="Register next invoice" busy={next.busy} onClick={() => next.run('Register next invoice', registerNext)} />
                <span className="text-xs text-muted">The next invoice is offered at {credit.advanceBps / 100}% advance and {credit.aprBps / 100}% APR ({TIERS[credit.tier]}).</span>
              </div>
            )}
            {next.err && <ErrorBanner {...next.err} />}
            {fin.err && <ErrorBanner {...fin.err} />}
            {again.err && <ErrorBanner {...again.err} />}
            {fin.tx && <div className="text-sm">Advance sent: <TxLink hash={fin.tx.hash} ms={fin.tx.ms} /></div>}
          </div>
        ) : <Empty message="No offer yet." />}
      </Panel>

      <Panel title="Payout history" className="md:col-span-2">
        {payouts && (payouts.f || payouts.p) ? (
          <div>
            {payouts.f && <RuleRow label="Advance" value={<span className="flex items-center gap-3"><span className="font-mono tabular">{fmtAusd(payouts.f.args.advance)} AUSD</span><TxLink hash={payouts.f.transactionHash} /></span>} />}
            {payouts.p && <RuleRow label="Balance after settlement" value={<span className="flex items-center gap-3"><span className="font-mono tabular">{fmtAusd(payouts.p.args.toExporter)} AUSD</span><TxLink hash={payouts.p.transactionHash} /></span>} />}
          </div>
        ) : <Empty message="No payouts yet." action={<Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>} />}
      </Panel>
    </div>
  );
}
