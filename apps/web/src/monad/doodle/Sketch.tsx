import { createElement, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { arrowP, checkP, circleP, line, rectP, scribLines, seeded } from './draw';

export { BoilFilter } from './BoilFilter';
export { Stamp } from '../../ui/Stamp';

let uid = 1;
const useSeed = (s?: number) => useRef(s ?? uid++ * 7919).current;

/** Observe an element's border-box size. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setSize((p) => (p.w === el.offsetWidth && p.h === el.offsetHeight ? p : { w: el.offsetWidth, h: el.offsetHeight }));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const delayVars = (delay = 0): CSSProperties => ({ ['--ink-delay' as string]: `${delay}s` });

/** One ink layer: boiled svg, every path draws itself (pathLength=1). */
function Ink({ w, h, stroke, paths, className = '', style }: { w: number; h: number; stroke: number; paths: { d: string; o?: number }[]; className?: string; style?: CSSProperties }) {
  return (
    <svg className={`ink ${className}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={style}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} pathLength={1} strokeWidth={stroke} opacity={p.o} />
      ))}
    </svg>
  );
}

type BoxProps = {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** stroke width in px (default 3) */
  stroke?: number;
  seed?: number;
  /** draw-on delay in seconds */
  delay?: number;
  /** spring the card in on mount (default true) */
  spring?: boolean;
  /** offset second stroke, like a hard drop shadow */
  shadow?: boolean;
  /** rotate the whole card a hair, degrees */
  tilt?: number;
  /** paper fill behind the content (default true) */
  fill?: boolean;
  /** stroke dashed + muted (placeholder / not-done look) */
  dashed?: boolean;
};

/** A box whose border is a hand-drawn ink outline that draws itself and boils.
 *  Content stays crisp HTML. Use instead of border/rounded divs. */
export function InkBox({ as = 'div', className = '', style, children, stroke = 3, seed, delay = 0, spring = true, shadow = false, tilt = 0, fill = true, dashed = false, ...rest }: BoxProps & Record<string, unknown>) {
  const [ref, { w, h }] = useBox<HTMLElement>();
  const s = useSeed(seed);
  const paths = w && h
    ? [
        ...(shadow ? [{ d: rectP(seeded(s + 1), 4, 4, w - 1, h - 1, 3), o: 0.35 }] : []),
        { d: rectP(seeded(s), 0, 0, w, h, 5) },
      ]
    : [];
  return createElement(
    as,
    {
      ref,
      className: `d-box ${fill ? 'd-fill' : ''} ${dashed ? 'd-dashed' : ''} ${spring ? 'd-spring' : ''} ${className}`,
      style: { ...delayVars(delay), ...(tilt ? { ['--tilt' as string]: `${tilt}deg` } : null), ...style },
      ...rest,
    },
    <Ink w={w} h={h} stroke={stroke} paths={paths} className="d-ink-abs" />,
    <div className="d-box-body">{children}</div>,
  );
}

/** Horizontal (default) or vertical hand-drawn line that fills its container. */
export function InkLine({ vertical = false, stroke = 3, seed, delay = 0, bend = 2.5, className = '', thickness = 12 }: { vertical?: boolean; stroke?: number; seed?: number; delay?: number; bend?: number; className?: string; thickness?: number }) {
  const [ref, { w, h }] = useBox<HTMLDivElement>();
  const s = useSeed(seed);
  const len = vertical ? h : w;
  const d = len ? (vertical ? line(seeded(s), thickness / 2, 0, thickness / 2, len, bend) : line(seeded(s), 0, thickness / 2, len, thickness / 2, bend)) : '';
  const style: CSSProperties = vertical ? { width: thickness } : { height: thickness };
  return (
    <div ref={ref} className={`d-line ${vertical ? 'h-full' : 'w-full'} ${className}`} style={{ ...style, ...delayVars(delay) }} aria-hidden="true">
      {len > 0 && <Ink w={vertical ? thickness : w} h={vertical ? h : thickness} stroke={stroke} paths={[{ d }]} />}
    </div>
  );
}

/** Fixed-size curved arrow. Drawn pointing right; `rotate` turns it (90 = down). */
export function InkArrow({ w = 56, h = 28, rotate = 0, bend = 5, stroke = 3, seed, delay = 0, className = '' }: { w?: number; h?: number; rotate?: number; bend?: number; stroke?: number; seed?: number; delay?: number; className?: string }) {
  const s = useSeed(seed);
  const jr = seeded(s);
  const d = arrowP(3, h / 2 + jr() * 2, w - 3, h / 2 - jr() * 2, bend, Math.min(11, h * 0.45));
  return <Ink w={w} h={h} stroke={stroke} paths={[{ d }]} className={`shrink-0 ${className}`} style={{ ...delayVars(delay), transform: rotate ? `rotate(${rotate}deg)` : undefined }} />;
}

/** Hand-drawn ring around its children (a step number, a count). */
export function InkCircle({ size = 36, stroke = 3, seed, delay = 0, dashed = false, className = '', children }: { size?: number; stroke?: number; seed?: number; delay?: number; dashed?: boolean; className?: string; children?: ReactNode }) {
  const s = useSeed(seed);
  const d = circleP(seeded(s), size / 2, size / 2, size / 2 - stroke - 1);
  return (
    <span className={`d-circle ${dashed ? 'd-dashed' : ''} ${className}`} style={{ width: size, height: size }}>
      <Ink w={size} h={size} stroke={stroke} paths={[{ d }]} className="d-ink-abs" style={delayVars(delay)} />
      <span className="relative">{children}</span>
    </span>
  );
}

/** A check mark that draws itself. */
export function InkCheck({ size = 20, stroke = 4, seed, delay = 0, className = '' }: { size?: number; stroke?: number; seed?: number; delay?: number; className?: string }) {
  const s = useSeed(seed);
  const r = seeded(s);
  const d = checkP(2 + r(), 2 + r(), size - 4);
  return <Ink w={size} h={size} stroke={stroke} paths={[{ d }]} className={`shrink-0 ${className}`} style={delayVars(delay)} />;
}

/** Highlighter swipe behind key words/numbers. Text stays ink on lime. */
export function Highlight({ children, delay = 0.2, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return <span className={`d-hl ${className}`} style={{ ['--hl-delay' as string]: `${delay}s` }}>{children}</span>;
}

/** Handwritten annotation (Patrick Hand), slightly rotated. */
export function HandNote({ children, rotate = -2, as: Tag = 'span', className = '' }: { children: ReactNode; rotate?: number; as?: ElementType; className?: string }) {
  return <Tag className={`d-hand ${className}`} style={{ transform: `rotate(${rotate}deg)`, display: 'inline-block' }}>{children}</Tag>;
}

/** Hand-drawn progress bar: inked outline, lime fill, scribble hatch up to `value` (0..1). */
export function InkBar({ value, label, className = '' }: { value: number; label?: ReactNode; className?: string }) {
  const [ref, { w, h }] = useBox<HTMLDivElement>();
  const v = Math.max(0, Math.min(1, value));
  const s = useSeed();
  const fw = Math.max(0, w * v - 6);
  const hatch = fw > 8 && h ? scribLines(seeded(s), 3, 7, fw, Math.max(1, Math.floor((h - 8) / 9)), 9) : '';
  return (
    <div className={`d-bar ${className}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div ref={ref} className="d-bar-track">
        <div className="d-bar-fill" style={{ width: `${v * 100}%` }} />
        {w > 0 && <Ink w={w} h={h} stroke={3} paths={[{ d: rectP(seeded(s + 3), 0, 0, w, h, 4) }]} className="d-ink-abs" />}
        {hatch && <Ink w={w} h={h} stroke={2} paths={[{ d: hatch, o: 0.55 }]} className="d-ink-abs" style={delayVars(0.4)} />}
      </div>
      {label !== undefined && <span className="d-bar-label">{label}</span>}
    </div>
  );
}
