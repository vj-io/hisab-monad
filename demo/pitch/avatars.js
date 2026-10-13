// Doodle avatars of the two founders: ink #0a0a0a on paper, one lime highlighter. Hand-drawn SVG, boiled strokes.
// Local box 400 x 460, bust anchored bottom-centre (200,460). Everything animated is a pure function of the pose S.
const SKIN = '#f7f4ef';

class Avatar {
  constructor(who) {
    this.who = who; this.isV = who === 'V';
    this.root = svgEl('g');
    this.halo = svgEl('path', { d: blobP(200, 258, 188, 200, .035, 48, .05), fill: LIME });
    this.halo.style.transformBox = 'fill-box'; this.halo.style.transformOrigin = 'center bottom';
    this.ink = svgEl('g', { filter: 'url(#boil)' });
    this.root.append(this.halo, this.ink);
    this.parts = []; this.xf = { X: 0, Y: 0, s: 1 }; this.done = false; this.lastMouth = -1;
    this.build();
    // sketch order -> windows
    this.parts.sort((a, b) => a.ord - b.ord);
    const n = this.parts.length, w = .24;
    this.parts.forEach((p, i) => { p.s0 = i / n * (1 - w); p.s1 = p.s0 + w; });
    this.setDraw(0);
  }
  G(parent) { const g = svgEl('g'); (parent || this.ink).append(g); return g; }
  P(parent, d, o = {}) {
    const e = svgEl('path', { d, pathLength: 1 });
    e.style.fill = o.fill || 'none'; e.style.stroke = o.stroke || INK; e.style.strokeWidth = o.w || 5;
    e.style.strokeLinecap = 'round'; e.style.strokeLinejoin = 'round';
    parent.append(e);
    this.parts.push({ el: e, ord: o.ord ?? 50, fill: !!o.fill && o.fill !== 'none', nodash: !!o.nodash, fillOnly: !!o.fillOnly });
    return e;
  }
  build() {
    const V = this.isV, I = this.ink;
    const gBody = this.G(), gHead = this.G(), gArms = this.G();
    this.gHead = gHead;
    // ---- neck + torso
    this.P(gBody, 'M170,270 L166,346 L234,346 L230,270', { fill: SKIN, ord: 20 });
    this.gTorso = this.G(gBody);
    if (V) {
      this.P(this.gTorso, 'M6,462 L8,408 C14,368 58,344 126,330 C142,326 152,322 160,314 L166,280 L200,364 L234,280 L240,314 C248,322 258,326 274,330 C342,344 386,368 392,408 L394,462 Z', { fill: INK, ord: 21, w: 6 });
      this.P(this.gTorso, 'M200,364 L200,464', { stroke: PAPER, w: 4, ord: 23 });
      this.P(this.gTorso, 'M192,384 L208,384 M192,404 L208,404 M192,424 L208,424 M192,444 L208,444', { stroke: PAPER, w: 4, ord: 23 });
      this.P(this.gTorso, 'M66,372 C50,406 46,434 44,464 M334,372 C350,406 354,434 356,464', { stroke: PAPER, w: 4, ord: 24 });
      this.P(this.gTorso, 'M158,316 C166,300 168,292 166,282 M242,316 C234,300 232,292 234,282', { stroke: PAPER, w: 4, ord: 24 });
      // thin chain with a lime pendant
      this.P(gBody, 'M176,290 C184,330 192,350 200,356 C208,350 216,330 224,290', { w: 4, ord: 25 });
      this.P(gBody, circleP(200, 364, 7, 1.05), { fill: LIME, w: 4, ord: 25 });
      // steepled hands
      this.gRest = this.G(gBody);
      this.P(this.gRest, 'M60,472 L168,420', { stroke: PAPER, w: 66, ord: 22, nodash: true });
      this.P(this.gRest, 'M60,472 L168,420', { stroke: INK, w: 54, ord: 22, nodash: true });
      this.P(this.gRest, 'M340,472 L232,420', { stroke: PAPER, w: 66, ord: 22, nodash: true });
      this.P(this.gRest, 'M340,472 L232,420', { stroke: INK, w: 54, ord: 22, nodash: true });
      this.gHandL = this.G(this.gRest); this.gHandR = this.G(this.gRest); this.gHands = [this.gHandL, this.gHandR];
      this.P(this.gHandL, 'M156,452 C152,424 172,394 200,372 L210,384 C198,404 194,424 192,446 Z', { fill: SKIN, ord: 26, w: 5 });
      this.P(this.gHandL, 'M170,432 L186,402 M164,444 L176,416', { w: 4, ord: 27 });
      this.P(this.gHandR, 'M244,452 C248,424 228,394 200,372 L190,384 C202,404 206,424 208,446 Z', { fill: SKIN, ord: 26, w: 5 });
      this.P(this.gHandR, 'M230,432 L214,402 M236,444 L224,416', { w: 4, ord: 27 });
      // resting left fist (shown when the right hand leaves the steeple)
      
    } else {
      this.P(this.gTorso, 'M4,462 L6,410 C12,372 56,346 124,332 L160,316 L170,286 L200,330 L230,286 L240,316 L276,332 C344,346 388,372 394,410 L396,462 Z', { fill: INK, ord: 21, w: 6 });
      // shirt collar (spread), lapels, placket, buttons, pocket
      this.P(this.gTorso, 'M172,288 L154,332 L196,350 Z M228,288 L246,332 L204,350 Z', { stroke: PAPER, w: 4, ord: 23 });
      this.P(this.gTorso, 'M154,334 L108,376 L138,412 M246,334 L292,376 L262,412', { stroke: PAPER, w: 4, ord: 23 });
      this.P(this.gTorso, 'M200,350 L200,464', { stroke: PAPER, w: 4, ord: 24 });
      this.P(this.gTorso, 'M200,384 l0.1 0 M200,422 l0.1 0', { stroke: PAPER, w: 10, ord: 24, nodash: true });
      this.P(this.gTorso, 'M296,400 L342,396', { stroke: PAPER, w: 4, ord: 24 });
    }
    // ---- head
    const H = gHead;
    this.P(H, V ? 'M131,186 C115,182 111,214 132,226' : 'M131,188 C113,184 109,218 133,228', { fill: SKIN, ord: 4 });
    this.P(H, V ? 'M269,186 C285,182 289,214 268,226' : 'M269,188 C287,184 291,218 267,228', { fill: SKIN, ord: 4 });
    this.P(H, 'M130,168 C128,118 160,92 200,92 C240,92 272,118 270,168 C272,200 270,224 262,248 C252,278 228,298 200,300 C172,298 148,278 138,248 C130,224 128,200 130,168 Z', { fill: SKIN, ord: 1, w: 6 });
    if (V) {
      // tousled dark hair with a fringe swept across the forehead
      this.P(H, 'M127,182 C113,150 118,116 141,99 C150,84 168,79 184,84 C196,71 221,71 233,84 C252,79 268,92 273,113 C285,134 284,162 273,191 C267,169 258,153 243,144 C226,136 206,132 188,140 C172,146 160,158 154,172 C150,164 146,170 142,188 Z', { fill: INK, ord: 2, w: 5 });
      this.P(H, 'M158,100 C160,112 166,120 174,126 M204,88 C206,98 208,106 209,114 M236,98 C232,110 226,118 220,124 M262,112 C266,124 266,134 264,144', { stroke: PAPER, w: 4, ord: 3 });
    } else {
      // curly dark hair: a cluster of curls
      const C = [[140, 124, 26], [124, 150, 20], [158, 100, 28], [188, 88, 31], [220, 88, 31], [250, 104, 28], [272, 132, 24], [276, 158, 17], [200, 112, 33], [172, 122, 22], [232, 124, 25], [208, 134, 17], [248, 144, 15], [150, 140, 17]];
      this.hairC = C;
      C.forEach(([x, y, r], i) => this.P(H, circleP(x, y, r, 1.02, i), { fill: INK, ord: 2 + (i % 2) * .1, w: 5 }));
      this.P(H, 'M142,118 a14,14 0 0 1 20,6 M176,92 a16,16 0 0 1 24,2 M212,86 a16,16 0 0 1 24,6 M246,100 a14,14 0 0 1 18,12 M194,116 a14,14 0 0 1 22,4 M230,126 a10,10 0 0 1 16,4', { stroke: PAPER, w: 4, ord: 3.5 });
    }
    // brows
    this.gBrL = this.G(H); this.gBrR = this.G(H);
    this.P(this.gBrL, V ? 'M148,172 L192,163' : 'M150,168 Q170,157 192,165', { w: V ? 8 : 6, ord: 6 });
    this.P(this.gBrR, V ? 'M208,163 L252,172' : 'M208,165 Q230,157 250,168', { w: V ? 8 : 6, ord: 6 });
    // eyes (almonds redrawn each frame) + pupils
    const ex = V ? [172, 228] : [171, 229], ey = V ? 196 : 195;
    this.eyes = ex.map(cx => ({ cx, cy: ey, rx: V ? 15 : 13, el: this.P(H, '', { fill: SKIN, w: 5, ord: 7 }), pu: this.P(H, `M${cx},${ey} l0.01 0`, { w: V ? 11 : 10, ord: 8, nodash: true }) }));
    this.P(H, V ? 'M200,202 C197,216 191,226 204,232' : 'M200,200 C198,214 194,224 205,228', { w: 4, ord: 9 });
    this.mouth = this.P(H, '', { w: 5, ord: 10, fill: 'none' });
    this.tongue = this.P(H, ellipseP(200, 272, 11, 5), { fill: LIME, w: 4, ord: 10, nodash: true }); this.tongue.style.opacity = 0;
    if (!V) {   // rimless glasses
      this.gGl = this.G(H);
      this.P(this.gGl, 'M149,182 Q149,176 160,176 L184,176 Q195,176 195,184 L195,202 Q195,214 183,214 L160,214 Q149,214 149,202 Z', { w: 4, ord: 11 });
      this.P(this.gGl, 'M205,184 Q205,176 216,176 L240,176 Q251,176 251,182 L251,202 Q251,214 240,214 L217,214 Q205,214 205,202 Z', { w: 4, ord: 11 });
      this.P(this.gGl, 'M195,188 Q200,183 205,188 M149,186 L130,190 M251,186 L270,190', { w: 4, ord: 11 });
    }
    // ---- arms (appear when the pose asks for them) : outlined limb + hand
    const mkArm = () => {
      const g = this.G(gArms); g.style.opacity = 0;
      const paper = svgEl('path', { fill: 'none', stroke: PAPER, 'stroke-width': 58, 'stroke-linecap': 'round' });
      const ink = svgEl('path', { fill: 'none', stroke: INK, 'stroke-width': 46, 'stroke-linecap': 'round' });
      const hand = svgEl('g');
      const palm = svgEl('path', { d: circleP(0, 0, 25, 1.03), fill: SKIN, stroke: INK, 'stroke-width': 5 });
      const fingers = [];
      const fdef = [[-90, 38], [-60, 46], [-30, 50], [0, 46]];   // point mode uses one long finger
      for (let i = 0; i < 4; i++) { const f = svgEl('path', { d: 'M14,-8 L52,-8 Q62,0 52,8 L14,8 Z', fill: SKIN, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }); fingers.push(f); }
      const thumb = svgEl('path', { d: 'M8,-16 L34,-30 Q42,-26 36,-18 L16,-6 Z', fill: SKIN, stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' });
      hand.append(...fingers, thumb, palm); g.append(paper, ink, hand);
      return { g, paper, ink, hand, fingers, thumb };
    };
    this.armP = mkArm();                 // the pointing / high-five / wave arm (V: right, B: left)
    if (!V) this.armG = mkArm();         // B's other arm pushes the glasses up
  }
  setXf(X, Y, s) { this.xf = { X, Y, s }; this.root.setAttribute('transform', `translate(${f1(X - 200 * s)} ${f1(Y - 460 * s)}) scale(${s.toFixed(4)})`); }
  toLocal(sx, sy) { const { X, Y, s } = this.xf; return [(sx - (X - 200 * s)) / s, (sy - (Y - 460 * s)) / s]; }
  // sketch-over: pencil strokes draw the avatar. p 0..1
  setDraw(p) {
    if (this.done && p >= 1) return;
    for (const k of this.parts) {
      const q = seg(p, k.s0, k.s1), s = k.el.style;
      if (p >= 1) { s.strokeDasharray = 'none'; s.strokeDashoffset = 0; s.opacity = 1; if (k.fill) s.fillOpacity = 1; continue; }
      if (k.nodash) { s.opacity = q > .5 ? 1 : 0; if (k.el === this.tongue) s.opacity = 0; continue; }
      s.strokeDasharray = '1 1'; s.strokeDashoffset = 1 - eo(q); s.opacity = q > 0 ? 1 : 0;
      if (k.fill) s.fillOpacity = seg(q, .55, 1);
    }
    this.done = p >= 1;
    this.drawP = p;
  }
  // the part currently being drawn (for the pencil): returns [x,y] in screen coords or null
  penTip(p) {
    let cur = null;
    for (const k of this.parts) { const q = seg(p, k.s0, k.s1); if (q > 0 && q < 1 && !k.nodash) cur = { k, q }; }
    if (!cur) return null;
    const el = cur.k.el, L = el.getTotalLength(), pt = el.getPointAtLength(L * eo(cur.q));
    const m = el.getScreenCTM(); if (!m) return null;
    return [m.a * pt.x + m.c * pt.y + m.e, m.b * pt.x + m.d * pt.y + m.f];
  }
  eyePath(e, open, blinkK) {
    const ry = lerp(this.isV ? 7 : 8.5, 1, blinkK) * (1 + .35 * open);
    return `M${f1(e.cx - e.rx)},${e.cy} Q${f1(e.cx)},${f1(e.cy - ry * 2)} ${f1(e.cx + e.rx)},${e.cy} Q${f1(e.cx)},${f1(e.cy + ry * 1.7)} ${f1(e.cx - e.rx)},${e.cy} Z`;
  }
  mouthPath(m) {
    const V = this.isV;
    if (m <= 0) return V ? 'M184,258 Q200,263 220,254' : 'M183,258 Q200,265 217,257';
    if (m === 1) return 'M184,256 Q200,249 217,255 Q200,269 184,256 Z';
    if (m === 2) return 'M182,254 Q200,245 219,254 Q219,277 200,279 Q181,277 182,254 Z';
    return 'M178,252 Q200,241 223,252 Q226,283 200,287 Q175,283 178,252 Z';
  }
  // pose: {t, mouth 0..3, blink 0..1, brow, browL, lookX, lookY, tilt, headX, headY, breathe, tap(-1..1),
  //        prom 0..1, arm:{k 0..1, tx, ty (screen target), mode 'point'|'palm'|'wave'}, glass 0..1}
  pose(S) {
    const V = this.isV, t = S.t;
    this.gTorso.setAttribute('transform', `translate(200 462) scale(${(1 + .012 * S.breathe).toFixed(4)} ${(1 + .016 * S.breathe).toFixed(4)}) translate(-200 -462)`);
    this.gHead.setAttribute('transform', `translate(${f1(S.headX || 0)} ${f1((S.headY || 0) - S.breathe * 1.4)}) rotate(${(S.tilt || 0).toFixed(2)} 200 300)`);
    const bl = S.blink || 0;
    this.eyes.forEach((e, i) => {
      e.el.setAttribute('d', this.eyePath(e, (S.eyeOpen || 0), bl));
      e.pu.setAttribute('d', `M${f1(e.cx + (S.lookX || 0) * 5)},${f1(e.cy + (S.lookY || 0) * 3)} l0.01 0`);
      e.pu.style.strokeWidth = (V ? 11 : 10) * (1 - bl) + .01;
    });
    const bu = S.brow || 0, bL = bu + (S.browL || 0);
    this.gBrL.setAttribute('transform', `translate(0 ${f1(-12 * bL)}) rotate(${f1(-5 * bL)} 170 168)`);
    this.gBrR.setAttribute('transform', `translate(0 ${f1(-12 * bu)}) rotate(${f1(5 * bu)} 230 168)`);
    const m = S.mouth | 0;
    if (m !== this.lastMouth || !this.done) {
      this.mouth.setAttribute('d', this.mouthPath(m));
      this.mouth.style.fill = m > 0 ? INK : 'none';
      this.tongue.setAttribute('d', ellipseCache(200, m === 2 ? 270 : 273, m === 2 ? 10 : 12, 4.5));
      this.lastMouth = m;
    }
    this.tongue.style.opacity = this.done && m >= 2 ? 1 : 0;
    // glasses nudge
    if (this.gGl) this.gGl.setAttribute('transform', `translate(0 ${f1(-5 * (S.glassPush || 0))})`);
    // steepled hands tap
    if (V) {
      const k = S.arm && this.done ? S.arm.k : 0, tp = S.tap || 0;
      this.gHandL.setAttribute('transform', `rotate(${f1(4 * tp)} 189 462)`);
      this.gHandR.setAttribute('transform', `rotate(${f1(-4 * (1 - Math.max(tp, 0)) * 0)} 211 462)`);
      this.gRest.style.opacity = k > .02 ? 0 : 1;
      
    }
    // halo
    const pr = S.prom || 0;
    this.halo.style.opacity = pr > .01 ? Math.min(1, pr * 1.4) : 0;
    this.halo.style.transform = `scale(${(.55 + .45 * pr).toFixed(3)})`;
    // arms
    const A = S.arm;
    this.drawArm(this.armP, V ? 1 : -1, A && this.done ? A : null, t);
    if (!V) this.drawArm(this.armG, 1, S.glass > .01 && this.done ? { k: S.glass, glass: true } : null, t);
  }
  drawArm(a, side, A, t) {
    if (!A || A.k <= .01) { a.g.style.opacity = 0; return; }
    const Sh = [200 + side * 128, 410];
    let H, ang, mode = A.mode || 'point';
    if (A.glass) {   // hand rises to the glasses bridge, finger up
      const k = eo(A.k), up = (A.k > .8 ? 1 : 0);
      H = [lerp(Sh[0] + 6 * side, 214, k), lerp(540, 252 - 9 * (A.push || 0), k)]; ang = -90; mode = 'point';
    } else {
      const k = eo(A.k), T = this.toLocal(A.tx, A.ty);
      const dx = T[0] - Sh[0], dy = T[1] - Sh[1], L = Math.hypot(dx, dy), reach = Math.min(L - (mode === 'point' ? 70 : 20), mode === 'point' ? 250 : 280);
      const Hf = [Sh[0] + dx / L * reach, Sh[1] + dy / L * reach];
      const wv = mode === 'wave' ? Math.sin(t * 11) * 22 : 0;
      H = [lerp(Sh[0] + side * 14, Hf[0] + wv * .4, k), lerp(560, Hf[1] - Math.abs(wv) * .3, k)];
      ang = mode === 'wave' ? -90 + side * 18 * Math.sin(t * 11) : Math.atan2(dy, dx) * 180 / Math.PI;
    }
    const mx = (Sh[0] + H[0]) / 2, my = (Sh[1] + H[1]) / 2, dx = H[0] - Sh[0], dy = H[1] - Sh[1], d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
    const bend = Math.min(46, d * .28), E = [mx + nx * bend, my + ny * bend];
    const dd = `M${f1(Sh[0])},${f1(Sh[1])} Q${f1(E[0])},${f1(E[1])} ${f1(H[0])},${f1(H[1])}`;
    a.paper.setAttribute('d', dd); a.ink.setAttribute('d', dd);
    // hand
    const pointAng = A.glass ? -90 : ang;
    a.hand.setAttribute('transform', `translate(${f1(H[0])} ${f1(H[1])}) rotate(${f1(pointAng)})`);
    const palm = mode !== 'point';
    a.fingers.forEach((f, i) => {
      if (!palm) { f.style.opacity = i === 0 ? 1 : 0; f.setAttribute('transform', 'rotate(0)'); if (i === 0) f.setAttribute('d', 'M14,-9 L74,-9 Q86,0 74,9 L14,9 Z'); }
      else { f.style.opacity = 1; f.setAttribute('d', 'M10,-7 L56,-7 Q65,0 56,7 L10,7 Z'); f.setAttribute('transform', `rotate(${-42 + i * 28})`); }
    });
    a.thumb.style.opacity = palm ? 1 : 0;
    a.g.style.opacity = 1;
  }
}
const _ec = {};
function ellipseCache(cx, cy, rx, ry) { const k = [cx, cy, rx, ry].join(); return _ec[k] || (_ec[k] = `M${cx - rx},${cy} a${rx},${ry} 0 1 0 ${2 * rx},0 a${rx},${ry} 0 1 0 ${-2 * rx},0 Z`); }
