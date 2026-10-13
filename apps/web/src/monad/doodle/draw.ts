/** Hand-drawn SVG path generators, lifted from the Doodle set's engine and
 *  adapted to UI scale (px). All take a seeded rng so wobble is stable per element. */
export type Rng = () => number;

/** mulberry32: tiny seeded PRNG. */
export const seeded = (a: number): Rng => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const f = (v: number) => v.toFixed(1);
const P = (x: number, y: number) => `${f(x)} ${f(y)}`;
const J = (r: Rng, a: number) => (r() - 0.5) * 2 * a;

export function line(r: Rng, x1: number, y1: number, x2: number, y2: number, b = 2.5) {
  const mx = (x1 + x2) / 2 + J(r, b), my = (y1 + y2) / 2 + J(r, b);
  return `M${P(x1 + J(r, 1), y1 + J(r, 1))} Q${P(mx, my)} ${P(x2 + J(r, 1), y2 + J(r, 1))}`;
}

/** Four overshooting strokes, like a box sketched with a marker. */
export function rectP(r: Rng, x: number, y: number, w: number, h: number, o = 5) {
  return [
    line(r, x - o * r(), y, x + w + o * r(), y),
    line(r, x + w, y - o * r(), x + w, y + h + o * r()),
    line(r, x + w + o * r(), y + h, x - o * r(), y + h),
    line(r, x, y + h + o * r(), x, y - o * r()),
  ].join(' ');
}

/** Circle that overshoots its start a little (turn > 1). */
export function circleP(r: Rng, cx: number, cy: number, rad: number, turn = 1.1, a0 = -2.2) {
  const n = 40;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 * turn;
    const rr = rad * (1 + J(r, 0.02) + (i / n) * 0.05);
    d += (i ? ' L' : 'M') + P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return d;
}

export function arrowP(x1: number, y1: number, x2: number, y2: number, bend = 6, head = 9) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / L) * bend, cy = my + (dx / L) * bend;
  const a = Math.atan2(y2 - cy, x2 - cx);
  return `M${P(x1, y1)} Q${P(cx, cy)} ${P(x2, y2)} M${P(x2 - Math.cos(a - 0.5) * head, y2 - Math.sin(a - 0.5) * head)} L${P(x2, y2)} L${P(x2 - Math.cos(a + 0.5) * head, y2 - Math.sin(a + 0.5) * head)}`;
}

export const checkP = (x: number, y: number, s: number) =>
  `M${P(x, y + s * 0.5)} L${P(x + s * 0.35, y + s * 0.88)} L${P(x + s, y)}`;

/** Zigzag scribble fill (highlighter / hatch). */
export function scribLines(r: Rng, x: number, y: number, w: number, n: number, gap = 8) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const yy = y + i * gap;
    d += ` M${P(x, yy)}`;
    let cx = x;
    while (cx < x + w) {
      const st = 9 + r() * 7;
      d += ` Q${P(cx + st / 2, yy + J(r, 3))} ${P(Math.min(cx + st, x + w), yy + J(r, 0.8))}`;
      cx += st;
    }
  }
  return d;
}
