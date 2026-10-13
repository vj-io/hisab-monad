import { useState } from 'react';
import { HandNote, Highlight, InkArrow, InkBox, InkCircle } from './Sketch';

const KEY = 'hisab-howitworks-hidden';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

function Node({ n, title, note, delay }: { n: number; title: string; note: string; delay: number }) {
  return (
    <InkBox className="min-w-0 flex-1 px-1.5 py-2 text-center" stroke={3} delay={delay}>
      <div className="flex items-center justify-center gap-1.5">
        <InkCircle size={24} stroke={2.5} delay={delay + 0.2} className="font-mono text-xs font-bold">{n}</InkCircle>
        <span className="font-display text-[14px] leading-none sm:text-[15px]">{title}</span>
      </div>
      <div className="d-hand mt-1 text-[15px] leading-tight text-muted">{note}</div>
    </InkBox>
  );
}

/** Compact "how it works" strip: Exporter -> Pool -> Buyer, plus the waterfall split. */
export function HowItWorks() {
  const [hidden, setHidden] = useState(read);
  const toggle = () => setHidden((h) => { try { localStorage.setItem(KEY, h ? '0' : '1'); } catch { /* storage unavailable */ } return !h; });
  if (hidden) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-3">
        <button type="button" onClick={toggle} className="d-hand text-[17px] underline decoration-wavy underline-offset-4">how does this work?</button>
      </div>
    );
  }
  return (
    <section aria-label="How it works" className="mx-auto max-w-5xl px-4 pt-4">
      <div className="flex items-stretch gap-1">
        <Node n={1} title="Exporter" note="ships, gets advance" delay={0.1} />
        <div className="flex flex-col items-center justify-center"><InkArrow w={30} h={22} delay={0.5} seed={11} /></div>
        <Node n={2} title="Pool" note="lends AUSD" delay={0.3} />
        <div className="flex flex-col items-center justify-center"><InkArrow w={30} h={22} delay={0.7} seed={12} /></div>
        <Node n={3} title="Buyer" note="pays at due date" delay={0.5} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <HandNote rotate={-2} className="text-[18px]">buyer pays, then it splits:</HandNote>
        <InkArrow w={34} h={20} seed={13} delay={0.9} />
        <InkBox className="px-2 py-1 text-[13px]" stroke={2.5} delay={1}><Highlight delay={1.2}>pool</Highlight> <span className="text-muted">principal + interest</span></InkBox>
        <InkBox className="px-2 py-1 text-[13px]" stroke={2.5} delay={1.1}>fee <span className="text-muted">platform</span></InkBox>
        <InkBox className="px-2 py-1 text-[13px]" stroke={2.5} delay={1.2}>exporter <span className="text-muted">balance</span></InkBox>
        <button type="button" onClick={toggle} className="d-hand ml-auto text-[16px] text-muted underline decoration-wavy underline-offset-4">hide</button>
      </div>
    </section>
  );
}
