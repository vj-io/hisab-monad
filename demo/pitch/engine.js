// Doodle engine for the Hisab team pitch. Helpers lifted from brag-styles/sets/doodle/ref/engine.html and the
// repo's demo/anim/hisab-doodle.html (board + camera + pencil), extended with photos, shots and avatars.
// Every function here is a pure function of time t (seconds on the video timeline).
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = x => 1 - Math.pow(1 - x, 3);
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const spring = x => x <= 0 ? 0 : 1 - Math.exp(-x * 8) * Math.cos(x * 20);
const lerp = (a, b, p) => a + (b - a) * p;
let _s = 20261014; const rnd = () => (_s = (_s * 16807) % 2147483647) / 2147483647;
const J = a => (rnd() - .5) * 2 * a;
const f1 = v => v.toFixed(1);
const P = (x, y) => `${f1(x)} ${f1(y)}`;
const SFX = [];
const sfx = (t, type, x) => SFX.push(x == null ? { t, type } : { t, type, x });
const INK = '#0a0a0a', PAPER = '#f0ede8', LIME = '#c8ff00', MUTED = '#6f6c66', CARD = '#f8f6f1';
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

// ------------------------------------------------------------------ doodle path generators
function line(x1, y1, x2, y2, b = 5) {
  const mx = (x1 + x2) / 2 + J(b), my = (y1 + y2) / 2 + J(b);
  return `M${P(x1 + J(2), y1 + J(2))} Q${P(mx, my)} ${P(x2 + J(2), y2 + J(2))}`;
}
function rectP(x, y, w, h, o = 9) {
  return [line(x - o * rnd(), y, x + w + o * rnd(), y), line(x + w, y - o * rnd(), x + w, y + h + o * rnd()),
          line(x + w + o * rnd(), y + h, x - o * rnd(), y + h), line(x, y + h + o * rnd(), x, y - o * rnd())].join(' ');
}
function circleP(cx, cy, r, turn = 1.1, a0 = -2.2) {
  const n = 56; let d = '';
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 * turn, rr = r * (1 + J(.025) + (i / n) * .05);
    d += (i ? ' L' : 'M') + P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return d;
}
function ellipseP(cx, cy, rx, ry) { return circleP(0, 0, 1000, 1.1).replace(/(-?\d+\.\d) (-?\d+\.\d)/g, (m, x, y) => `${f1(cx + x / 1000 * rx)} ${f1(cy + y / 1000 * ry)}`); }
function arcP(cx, cy, r, a1, a2) {
  let d = ''; const n = 24;
  for (let i = 0; i <= n; i++) { const a = a1 + (a2 - a1) * i / n; d += (i ? ' L' : 'M') + P(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return d;
}
function arrowP(x1, y1, x2, y2, bend = 40, head = 26) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const cx = mx - dy / L * bend, cy = my + dx / L * bend;
  const a = Math.atan2(y2 - cy, x2 - cx);
  return `M${P(x1, y1)} Q${P(cx, cy)} ${P(x2, y2)} M${P(x2 - Math.cos(a - .5) * head, y2 - Math.sin(a - .5) * head)} L${P(x2, y2)} L${P(x2 - Math.cos(a + .5) * head, y2 - Math.sin(a + .5) * head)}`;
}
const checkP = (x, y, s) => `M${P(x, y + s * .5)} L${P(x + s * .35, y + s * .88)} L${P(x + s, y)}`;
const crossP = (x, y, s) => `${line(x, y, x + s, y + s, 3)} ${line(x + s, y, x, y + s, 3)}`;
function scribLines(x, y, w, n, gap = 26) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const ww = i === n - 1 ? w * (.4 + rnd() * .3) : w * (.85 + rnd() * .15), yy = y + i * gap;
    d += ` M${P(x, yy)}`; let cx = x;
    while (cx < x + ww) { const st = 18 + rnd() * 14; d += ` Q${P(cx + st / 2, yy + J(6))} ${P(Math.min(cx + st, x + ww), yy + J(1.5))}`; cx += st; }
  }
  return d;
}
function sparkP(x, y, s) {
  return [0, 1, 2, 3].map(k => { const a = k * Math.PI / 2 + .3; return line(x + Math.cos(a) * s * .35, y + Math.sin(a) * s * .35, x + Math.cos(a) * s, y + Math.sin(a) * s, 1); }).join(' ');
}
function burstP(x, y, r0, r1, n = 10) { // radial burst
  let d = ''; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + .2; d += ' ' + line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 1); } return d;
}
function blobP(cx, cy, rx, ry, w = .06, n = 14, jit = .4) { // closed organic blob (highlighter patch)
  let d = ''; const ph = rnd() * 6;
  for (let i = 0; i <= n; i++) { const a = (i % n) / n * Math.PI * 2, k = 1 + w * Math.sin(a * 3 + ph) + (i === n ? 0 : 0) + (i % n ? J(w * jit) : 0); d += (i ? ' L' : 'M') + P(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); }
  return d + ' Z';
}
const personP = (x, y, s = 1) => `${circleP(x, y, 26 * s, 1.03)} ${line(x, y + 28 * s, x, y + 110 * s, 3)} ${line(x - 40 * s, y + 60 * s, x + 40 * s, y + 60 * s, 3)} ${line(x, y + 110 * s, x - 30 * s, y + 170 * s, 3)} ${line(x, y + 110 * s, x + 30 * s, y + 170 * s, 3)}`;
function squigP(x, y, w, amp = 26) { // a signature scrawl
  let d = `M${P(x, y)}`; const n = 9;
  for (let i = 1; i <= n; i++) d += ` Q${P(x + w * (i - .5) / n, y + (i % 2 ? -amp : amp) * (1 - i / (n + 3)) + J(6))} ${P(x + w * i / n, y + J(5))}`;
  return d + ` L${P(x + w + 10, y + 12)}`;
}
function zigFill(x, y, w, h, rows) { // wipe scribble
  let d = `M${P(x, y)}`;
  for (let i = 1; i <= rows; i++) d += ` L${P(i % 2 ? x + w : x, y + (h * i) / rows + J(20))}`;
  return d;
}
function gearP(cx, cy, r) {
  let d = circleP(cx, cy, r, 1.02) + ' ' + circleP(cx, cy, r * .38, 1.02);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; d += ' ' + line(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22), 1); }
  return d;
}

// ------------------------------------------------------------------ timeline from the voice (layout.js)
const LINE = {}; for (const l of window.LINES) LINE[l.id] = l;
// time of a phrase inside a line, by character position (+ off seconds). Voice speaks ~linearly across the line.
const T = (id, ph, off = 0) => {
  const l = LINE[id], k = ph === 0 ? 0 : l.text.indexOf(ph);
  if (k < 0) throw new Error('phrase not found: ' + ph + ' in ' + id);
  return l.t + (l.end - l.t) * ((k / l.text.length) * .94 + .02) + off;
};
const LT = (id, off = 0) => LINE[id].t + off;       // line start
const LE = (id, off = 0) => LINE[id].end + off;     // line end
const envAt = (who, t) => { const E = who === 'V' ? window.ENV_V : window.ENV_B; const i = Math.round(t * 100); return (E[i] || 0) / 99; };

// ------------------------------------------------------------------ board: panels, camera, performers
const cam = document.getElementById('cam');
const panels = [], PEN = [], CUR = [], MOVES = [];
const press = x => x < 0 ? 0 : x < .1 ? x / .1 : Math.max(0, 1 - (x - .1) / .25);

class Panel {
  constructor(name, px, py) {
    Object.assign(this, { name, px, py, tracks: [], hooks: [] });
    this.el = document.createElement('div'); this.el.className = 'panel';
    this.el.style.left = px + 'px'; this.el.style.top = py + 'px';
    this.svg = svgEl('svg', { class: 'ink', width: 1920, height: 1080 });
    this.fills = svgEl('g'); this.g = svgEl('g', { filter: 'url(#boil)' });
    this.svg.append(this.fills, this.g);
    this.svgT = svgEl('svg', { class: 'ink top', width: 1920, height: 1080 });
    this.gT = svgEl('g', { filter: 'url(#boil)' }); this.svgT.append(this.gT);
    this.el.append(this.svg, this.svgT); cam.append(this.el); panels.push(this);
  }
  // draw-on stroke. at/dur absolute seconds. o: {w,color,quiet,pen,out,top,parent}
  path(d, at, dur = .5, o = {}) {
    const p = svgEl('path', { d, pathLength: 1 });
    p.style.strokeWidth = o.w || 5; if (o.color) p.style.stroke = o.color;
    p.style.strokeDasharray = '1 1'; (o.parent || (o.top ? this.gT : this.g)).append(p);
    this.tracks.push({ kind: 'draw', el: p, at, dur, out: o.out });
    if (dur >= .35 && !o.quiet) sfx(at, 'scribble', Math.min(dur, 1.2));
    if (o.pen) PEN.push({ at, dur, pan: this, get: q => { const pt = p.getPointAtLength(p.getTotalLength() * q); return [pt.x, pt.y]; } });
    return p;
  }
  block(x, y, w, h, at, o = {}) {
    const r = svgEl('rect', { x, y, width: w, height: h, rx: o.rx ?? 4 });
    r.style.fill = o.color || LIME; r.style.transformBox = 'fill-box'; r.style.transformOrigin = o.origin || 'left center';
    if (o.blend) r.style.mixBlendMode = o.blend;
    (o.top ? this.gT : this.fills).append(r);
    this.tracks.push({ kind: o.kind || 'grow', el: r, at, dur: o.dur || .35, out: o.out });
    return r;
  }
  // HTML text. anim: write | pop | fade | stamp | op | none
  text(x, y, html, cls, at, o = {}) {
    const d = document.createElement('div'); d.className = 't ' + cls; d.innerHTML = html;
    Object.assign(d.style, { left: x + 'px', top: y + 'px' }, o.style || {});
    if (o.w) d.style.width = o.w + 'px';
    if (o.rot) d.dataset.rot = o.rot;
    this.el.append(d);
    const anim = o.anim || 'write';
    const dur = o.dur || (anim === 'write' ? Math.max(.4, d.textContent.length * .028) : .4);
    this.tracks.push({ kind: anim, el: d, at, dur, out: o.out });
    d.querySelectorAll('.mk > i').forEach((m, k) => this.tracks.push({ kind: 'marker', el: m, at: at + dur + .05 + k * .2, dur: .35, out: o.out }));
    if (anim === 'pop') sfx(at, 'pop');
    if (anim === 'stamp') sfx(at + .12, 'stamp');
    if (anim === 'write' && o.pen) {
      const w = d.offsetWidth, h = d.offsetHeight;
      PEN.push({ at, dur, pan: this, get: q => [x + w * q, y + h * .8] });
    }
    return d;
  }
  // text that changes with time. fn(t) -> html
  live(x, y, cls, style, at, fn, o = {}) {
    const d = this.text(x, y, '', cls, at, { anim: o.anim || 'op', style, w: o.w, dur: .3, out: o.out });
    this.hooks.push(t => { if (t >= at) d.innerHTML = fn(t); }); return d;
  }
  on(fn) { this.hooks.push(fn); }
  card(x, y, w, h, at, o = {}) {
    this.block(x, y, w, h, at, { color: CARD, kind: 'op', dur: .3, rx: 6, out: o.out });
    return this.path(rectP(x, y, w, h, 8), at, o.dur || .6, { w: 6, pen: o.pen, out: o.out });
  }
  stamp(x, y, txt, at, o = {}) {
    return this.text(x, y, txt, 'stamp', at, { anim: 'stamp', rot: o.rot ?? -6, out: o.out, style: Object.assign({ fontSize: (o.fs || 76) + 'px', color: INK, borderColor: INK }, o.style || {}) });
  }
  checkBadge(cx, cy, r, at, o = {}) {
    this.block(cx - r, cy - r, 2 * r, 2 * r, at, { rx: r, kind: 'popb', origin: 'center', out: o.out });
    this.path(circleP(cx, cy, r, 1.05), at, .3, { w: 5, quiet: 1, out: o.out });
    this.path(checkP(cx - r * .45, cy - r * .35, r * .95), at + .12, .25, { w: 9, quiet: 1, out: o.out });
    sfx(at + .1, 'success', 3);
  }
  // fly a chip along a quadratic path from p0 via c to p1
  fly(html, p0, c, p1, t0, dur, o = {}) {
    const d = document.createElement('div'); d.className = o.cls || 'coin'; d.innerHTML = html;
    if (o.style) Object.assign(d.style, o.style); this.el.append(d);
    this.hooks.push(t => {
      const p = seg(t, t0, t0 + dur), e = eio(p), q = 1 - e;
      const x = q * q * p0[0] + 2 * q * e * c[0] + e * e * p1[0], y = q * q * p0[1] + 2 * q * e * c[1] + e * e * p1[1];
      const vis = t >= t0 && (o.stay || t <= t0 + dur + .05) && !(o.out && t > o.out[1]);
      d.style.opacity = vis ? 1 : 0; d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.transform = `translate(-50%,-50%) scale(${(1 + .25 * Math.sin(Math.PI * p)).toFixed(3)}) rotate(${(p * 360).toFixed(0)}deg)`;
    });
    return d;
  }
  // a real product still inside a hand-drawn browser frame. returns geometry + a mapper from the shot's 2x png pixels to panel coords
  shot(key, x, y, w, at, o = {}) {
    const S = SHOT[key], bar = 46, iw = w - 10, k = iw / S.w, ih = Math.round(S.h * k), H = ih + bar + 10;
    this.block(x + 14, y + 14, w, H, at + .3, { color: INK, kind: 'grow', dur: .3, rx: 4, out: o.out });
    this.block(x, y, w, H, at, { color: CARD, kind: 'grow', dur: .35, rx: 4, out: o.out });
    this.path(rectP(x, y, w, H, 7), at, .7, { w: 7, pen: o.pen, out: o.out });
    this.path(line(x, y + bar, x + w, y + bar, 3), at + .35, .3, { w: 5, quiet: 1, out: o.out });
    [0, 1, 2].forEach(i => this.path(circleP(x + 28 + i * 30, y + bar / 2, 8, 1.05), at + .4 + i * .08, .2, { w: 4, quiet: 1, out: o.out }));
    this.text(x + 128, y + 8, o.url || 'hisab-monad.vercel.app', 'mono', at + .5, { anim: 'op', out: o.out, style: { fontSize: '22px', color: MUTED, whiteSpace: 'nowrap' } });
    const box = document.createElement('div'); box.className = 'shotbox';
    Object.assign(box.style, { left: (x + 5) + 'px', top: (y + bar + 4) + 'px', width: iw + 'px', height: ih + 'px' });
    const img = document.createElement('img'); img.src = S.src; img.className = 'shotimg'; img.style.width = iw + 'px'; img.style.height = ih + 'px';
    box.append(img); this.el.append(box);
    this.tracks.push({ kind: 'wipeY', el: box, at: at + .45, dur: .5, out: o.out });
    const ox = x + 5, oy = y + bar + 4, sc = k / 2;           // png px -> 1x source px -> panel px
    return { x, y, w, h: H, map: (rx, ry, rw, rh) => ({ x: ox + rx * sc, y: oy + ry * sc, w: rw * sc, h: rh * sc }) };
  }
  update(u) {
    for (const k of this.tracks) {
      const p = seg(u, k.at, k.at + k.dur), s = k.el.style, rot = +(k.el.dataset?.rot || 0);
      const fo = k.out ? 1 - seg(u, k.out[0], k.out[1]) : 1;
      switch (k.kind) {
        case 'draw': s.strokeDashoffset = 1 - eo(p); s.opacity = (p > 0 ? 1 : 0) * fo; break;
        case 'grow': s.transform = `scaleX(${eo(p)})`; s.opacity = fo; break;
        case 'growY': s.transform = `scaleY(${eo(p)})`; s.opacity = fo; break;
        case 'op': s.opacity = p * fo; break;
        case 'wipeY': s.clipPath = `inset(0 0 ${f1((1 - eo(p)) * 100)}% 0)`; s.opacity = (p > 0 ? 1 : 0) * fo; break;
        case 'write': s.clipPath = `inset(-30% ${f1((1 - p) * 100)}% -30% -2%)`; s.opacity = (p > 0 ? 1 : 0) * fo; s.transform = rot ? `rotate(${rot}deg)` : ''; break;
        case 'fade': s.opacity = p * fo; s.transform = `translateY(${f1((1 - eo(p)) * 24)}px) rotate(${rot}deg)`; break;
        case 'pop': { const x = u - k.at; const sc = x <= 0 ? 0 : spring(x * 1.1); s.opacity = (x > 0 ? 1 : 0) * fo; s.transform = `scale(${sc.toFixed(3)}) rotate(${rot}deg)`; break; }
        case 'popb': { const x = u - k.at; const sc = x <= 0 ? 0 : spring(x * 1.1); s.transform = `scale(${sc.toFixed(3)})`; s.transformOrigin = 'center'; s.opacity = fo; break; }
        case 'stamp': { const x = u - k.at; const q = clamp(x / .16); s.opacity = (x > 0 ? 1 : 0) * fo; s.transform = `scale(${(2.4 - 1.4 * eo(q)).toFixed(3)}) rotate(${rot}deg)`; break; }
        case 'marker': s.transform = `scaleX(${eo(p)}) skewX(-6deg)`; s.opacity = fo; break;
      }
    }
    for (const fn of this.hooks) fn(u);
  }
}
const SHOT = {};  // filled by scenes.js: key -> {src, w, h} (w,h = source crop px)

// ------------------------------------------------------------------ camera
const ctr = p => [p.px + 960, p.py + 540];
function move(t0, t1, to, dip = 0) { MOVES.push({ t0, t1, to, dip }); }
function cut(t, to) { MOVES.push({ t0: t, t1: t, to, cut: true }); }
const drift = (st, dt) => ({ cx: st.cx, cy: st.cy, s: st.s * (st.nodrift ? 1 : 1 + .0042 * clamp(dt, 0, 8)) });
let START = { cx: 960, cy: 540, s: 1 };
function camAt(t) {
  let st = { ...START }, tEnd = 0;
  for (const m of MOVES) {
    if (t < m.t0) return drift(st, t - tEnd);
    if (m.cut) { st = { cx: m.to[0], cy: m.to[1], s: m.to[2], nodrift: m.to[2] < .5 }; tEnd = m.t0; continue; }
    const from = drift(st, m.t0 - tEnd);
    if (t < m.t1) {
      const p = eio(seg(t, m.t0, m.t1));
      return { cx: lerp(from.cx, m.to[0], p), cy: lerp(from.cy, m.to[1], p), s: lerp(from.s, m.to[2], p) * (1 - (m.dip || 0) * Math.sin(Math.PI * p)) };
    }
    st = { cx: m.to[0], cy: m.to[1], s: m.to[2], nodrift: m.to[2] < .5 }; tEnd = m.t1;
  }
  return drift(st, t - tEnd);
}
const w2s = (wx, wy, c) => [960 + (wx - c.cx) * c.s, 540 + (wy - c.cy) * c.s];
// pose that puts panel-local point (x,y) at screen (960,365) (above the avatar docks) at zoom sc
const foc = (pan, x, y, sc) => [pan.px + x, pan.py + y + 175 / sc, sc];
// camera pose that frames a panel-local rect inside the safe window above the avatar docks
// (target box x 130..1790, y 110..620), never magnifying more than smax.
function frame(pan, r, smax = 2.2, box = [1660, 500], at = [960, 365]) {
  const s = Math.min(box[0] / r.w, box[1] / r.h, smax);
  const cx = pan.px + r.x + r.w / 2 - (at[0] - 960) / s, cy = pan.py + r.y + r.h / 2 - (at[1] - 540) / s;
  return [cx, cy, s];
}

// ------------------------------------------------------------------ build registry (scenes run after fonts load)
const BUILD = []; const PAN = {};
const PX = 2200, PY = 1250;
const tag = (p, txt, at, o = {}) => p.text(o.x ?? 160, o.y ?? 122, txt, 'mono', at, { anim: 'fade', out: o.out, style: { fontSize: '24px', letterSpacing: '.2em', color: MUTED } });
const hand = (p, x, y, txt, at, o = {}) => p.text(x, y, txt, 'hand', at, { anim: o.anim || 'write', dur: o.dur, pen: o.pen, out: o.out, rot: o.rot, style: Object.assign({ fontSize: (o.fs || 56) + 'px', color: o.color || INK }, o.style || {}) });
const mark = (txt) => `<span class="mk"><i></i>${txt}</span>`;
