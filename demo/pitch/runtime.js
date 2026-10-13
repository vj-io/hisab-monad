// Runtime: avatar choreography (lip-sync from each voice's own amplitude), pencil + cursor performers, scribble wipe, render(t).
const AV = {}, avl = document.getElementById('avl');
const DOCK = { V: { X: 268, Y: 1092 }, B: { X: 1652, Y: 1092 } };
const CLOSE_T0 = W_C4 + .3, CLOSE_T1 = W_C4 + 1.0, HF = LT('L19') + .95;
const CLOSEPOS = { V: { X: 690, Y: 1092, s: 1.0 }, B: { X: 1230, Y: 1092, s: 1.0 } };
const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const trapez = (t, a, b, up, dn) => Math.min(seg(t, a, a + up), 1 - seg(t, b, b + dn));
const pulse = (t, ti, hold = .35) => seg(t, ti, ti + .14) * (1 - seg(t, ti + hold, ti + hold + .35));
const mine = (who, l) => l.who.includes(who);
const SPK = { V: LINES.filter(l => mine('V', l)).map(l => [l.t - .1, l.end + .1]), B: LINES.filter(l => mine('B', l)).map(l => [l.t - .1, l.end + .1]) };
const promAt = (who, t) => {
  if (t >= CLOSE_T0) return 1;
  if (t < INTRO[who].sk1) return 0;
  let m = 0; for (const [a, b] of SPK[who]) m = Math.max(m, trapez(t, a, b, .22, .5)); return m;
};
const speaking = (who, t) => SPK[who].some(([a, b]) => t >= a && t <= b);
// blinks: seeded, every 2.2-4.6 s
const BL = { V: [], B: [] };
for (const [who, seed] of [['V', 7], ['B', 19]]) { let s = seed, tt = 1.1 + seed * .03; while (tt < 120) { s = (s * 16807) % 2147483647; BL[who].push(tt); tt += 2.2 + (s / 2147483647) * 2.4; } }
const blinkAt = (who, t) => { let m = 0; for (const b of BL[who]) { if (t >= b && t < b + .17) m = 1 - Math.abs((t - b) / .17 * 2 - 1); } return m; };
const RAISE = {
  V: [T('L1', 'Vaibhav'), T('L3', 'sixty to ninety'), T('L7', 'trillions'), T('L10', 'thirty-nine thousand'), T('L12', 'one transaction'), T('L14', 'entitlements'), T('L17', 'cheaper'), LT('L19') + .3, T('L9', 'priced by')],
  B: [T('L2', 'Bhavya'), T('L4', 'locked'), T('L6', 'twice'), T('L8', 'tokenised'), T('L11', 'refuses'), T('L13', 'eighty-eight'), T('L15', 'four hundred'), T('L18', 'live'), LT('L19') + .3],
};
const LRAISE = {   // the listener's one-brow reaction to the other's key point
  V: [T('L6', 'twice') + .3, T('L13', 'eighty-eight') + .3, T('L15', 'four hundred') + .2, T('L11', 'refuses') + .2],
  B: [T('L7', 'trillions') + .3, T('L10', 'thirty-nine thousand') + .4, T('L12', 'one transaction') + .3, T('L3', 'sixty to ninety') + .3, T('L14', 'entitlements') + .3],
};
const NOD = { V: [], B: [] };
for (const l of LINES) { for (const who of 'VB') if (!mine(who, l) && l.end - l.t > 2.4) { NOD[who].push(l.t + 1.0); NOD[who].push(l.end - .8); if (l.end - l.t > 5) NOD[who].push((l.t + l.end) / 2); } }
const POINT = {
  V: [{ t0: T('L9', 'priced by') - .1, t1: LE('L9') - .3, tx: 1180, ty: 330 }, { t0: T('L10', 'thirty-nine thousand') - .3, t1: T('L10', 'one click') + .6, tx: 1000, ty: 330 },
      { t0: LT('L12') + 1.3, t1: LE('L12') - .3, tx: 980, ty: 340 }],
  B: [{ t0: LT('L11') + .5, t1: LE('L11') - .35, tx: 960, ty: 330 }, { t0: LT('L13') + .5, t1: LE('L13') - .4, tx: 960, ty: 320 }],
};
const GLASS = [LT('L3') + 3.2, LT('L5') + 1.2, LT('L9') + 3.4, LT('L12') + 2.6, LT('L14') + 3.0, LT('L17') + 2.5];   // Bhavya pushes his glasses up while Vaibhav talks
const glassAt = t => { let k = 0, push = 0; for (const g of GLASS) { const q = trapez(t, g, g + .55, .42, .45); if (q > k) { k = q; push = seg(t, g + .38, g + .5) * (1 - seg(t, g + .62, g + .85)); } } return { k, push }; };
const lookAt = (who, t) => {
  const dir = who === 'V' ? 1 : -1, spk = speaking(who, t);
  if (t >= CLOSE_T0) return { x: dir * .9, y: -.1 };
  if (spk) return { x: dir * (.45 + .3 * Math.sin(t * .8)), y: -.25 };
  const g = Math.sin(t * .6 + (who === 'V' ? 1 : 3));
  return g > .86 ? { x: dir * .3, y: -.55 } : { x: dir * .95, y: .05 };
};
function armAt(who, t) {
  if (t >= CLOSE_T0 + .2) {
    const k = seg(t, CLOSE_T0 + .25, HF - .08);
    if (t < HF + .35) return { k: eo(k), tx: 960, ty: 730, mode: 'palm', maxReach: 345 };
    const cp = CLOSEPOS[who], sg = who === 'V' ? 1 : -1;
    return { k: 1, tx: cp.X + sg * 150, ty: 560, mode: 'wave', maxReach: 300 };
  }
  for (const w of POINT[who]) { const k = trapez(t, w.t0, w.t1, .4, .45); if (k > .01) return { k, tx: w.tx, ty: w.ty, mode: 'point' }; }
  return null;
}
function placeAv(who, t, c) {
  const R = INTRO[who], D = DOCK[who], prom = promAt(who, t);
  const sDock = lerp(.84, 1.0, prom);
  const ph = w2s(R.pan.px + R.fx, R.pan.py + R.fy, c), sPh = 1.22 * c.s;
  let X, Y, s;
  if (t < R.tr0) { X = ph[0]; Y = ph[1]; s = sPh; }
  else if (t < R.tr1) { const k = easeBack(seg(t, R.tr0, R.tr1)); X = lerp(ph[0], D.X, k); Y = lerp(ph[1], D.Y, k); s = lerp(sPh, sDock, k); }
  else { X = D.X; Y = D.Y; s = sDock; }
  if (t >= CLOSE_T0) {
    const k = easeBack(seg(t, CLOSE_T0, CLOSE_T1)), C = CLOSEPOS[who];
    const X0 = D.X, s0 = 1.0; X = lerp(X0, C.X, k); Y = C.Y; s = lerp(s0, C.s, k);
  }
  return { X, Y, s };
}
function avatarFrame(t, c) {
  for (const who of 'VB') {
    const A = AV[who], R = INTRO[who];
    const p = clamp((t - R.sk0) / (R.sk1 - R.sk0));
    A.setDraw(p);
    const xf = placeAv(who, t, c); A.setXf(xf.X, xf.Y, xf.s);
    const prom = promAt(who, t);
    let m = 0;
    if (A.done && speaking(who, t)) { const e = Math.max(envAt(who, t), envAt(who, t - .03), envAt(who, t + .02)); m = e < .07 ? 0 : e < .26 ? 1 : e < .52 ? 2 : 3; }
    const lk = lookAt(who, t);
    let br = 0; for (const ti of RAISE[who]) br = Math.max(br, pulse(t, ti, .45));
    let brL = 0; for (const ti of LRAISE[who]) brL = Math.max(brL, pulse(t, ti, .5));
    let nod = 0; for (const ti of NOD[who]) nod = Math.max(nod, Math.sin(Math.PI * seg(t, ti, ti + .55)));
    const spk = prom > .5;
    const g = who === 'B' ? glassAt(t) : { k: 0, push: 0 };
    const cyc = (t % 2.5) / .7, tap = who === 'V' ? (cyc < 1 ? Math.sin(cyc * Math.PI * 3) : 0) * (spk ? .6 : 1) : 0;
    A.pose({ t, mouth: m, blink: blinkAt(who, t), brow: br * .9 + (spk ? .08 : 0), browL: brL * .8 - (brL > 0 ? br * .8 : 0), lookX: lk.x, lookY: lk.y,
      tilt: (spk ? 1.5 : .7) * Math.sin(t * (spk ? 2.3 : 1.1) + (who === 'V' ? 0 : 2)) - 2.2 * nod * (who === 'V' ? -1 : 1) * .5 * (nod > .01 ? 1 : 0),
      headX: (spk ? 2.2 : .8) * Math.sin(t * 1.3 + (who === 'V' ? 1 : 4)), headY: 8 * nod + (spk ? 1.5 * Math.sin(t * 3.1) : 0),
      breathe: Math.sin(t * 1.9 + (who === 'V' ? 0 : 1.7)), tap, prom, arm: armAt(who, t), glass: g.k, glassPush: g.push, eyeOpen: br * .6 });
  }
  const show = who => t >= INTRO[who].tr1 && t < CLOSE_T0;
  const nv = document.getElementById('nameV'), nb = document.getElementById('nameB');
  nv.style.opacity = show('V') ? 1 : 0; nb.style.opacity = show('B') ? 1 : 0;
  nv.style.left = '150px'; nv.style.top = '972px'; nb.style.right = '150px'; nb.style.top = '972px';
}

// ------------------------------------------------------------------ performers: pencil, cursor, ripple, wipe
const pencilEl = document.getElementById('pencil'), cursorEl = document.getElementById('cursor'), rippleEl = document.getElementById('ripple');
const turb = document.getElementById('turb'), wipeP = document.getElementById('wipe-p');
let lastSeed = -1;
function curAt(t) {
  if (!CUR.length || t < CUR[0].t - .4) return null;
  let k = 0; while (k < CUR.length - 1 && CUR[k + 1].t <= t) k++;
  const a = CUR[k], b = CUR[k + 1];
  if (!b || b.pan !== a.pan || b.t - a.t > 5) return t > a.t + 1.3 ? null : { x: a.x, y: a.y };
  const p = eio(seg(t, a.t, b.t));
  return { x: lerp(a.x, b.x, p) + Math.sin(t * 5) * 3 * (1 - p), y: lerp(a.y, b.y, p) + Math.cos(t * 4) * 3 * (1 - p) };
}
function render(t) {
  const c = camAt(t);
  cam.style.transform = `translate(${f1(960 - c.cx * c.s)}px, ${f1(540 - c.cy * c.s)}px) scale(${c.s.toFixed(4)})`;
  const hw = 960 / c.s + 160, hh = 540 / c.s + 160;
  for (const p of panels) {
    const vis = p.px + 1920 > c.cx - hw && p.px < c.cx + hw && p.py + 1080 > c.cy - hh && p.py < c.cy + hh;
    p.el.style.display = vis ? 'block' : 'none'; p.vis = vis;
    if (vis) p.update(t);
  }
  const seed = 1 + (Math.floor(t * 10) % 6);
  if (seed !== lastSeed) { turb.setAttribute('seed', seed); lastSeed = seed; }
  avatarFrame(t, c);
  // pencil: the latest active stroke (panel ink, handwriting, or an avatar being sketched)
  let tip = null, tipAt = -1;
  for (const e of PEN) if (t >= e.at - .02 && t <= e.at + e.dur + .15 && e.pan.vis && e.at > tipAt) {
    const q = eo(seg(t, e.at, e.at + e.dur)), [x, y] = e.get(q), s = w2s(e.pan.px + x, e.pan.py + y, c); tip = s; tipAt = e.at;
  }
  for (const who of 'VB') { const R = INTRO[who]; if (t >= R.sk0 - .02 && t <= R.sk1 + .1 && R.sk0 > tipAt) { const s = AV[who].penTip(seg(t, R.sk0, R.sk1)); if (s) { tip = s; tipAt = R.sk0; } } }
  if (tip) { pencilEl.style.display = 'block'; pencilEl.style.transform = `translate(${f1(tip[0] - 4)}px, ${f1(tip[1] - 86)}px)`; } else pencilEl.style.display = 'none';
  // cursor
  const cp = curAt(t);
  if (cp) { const s = w2s(cp.x, cp.y, c); cursorEl.style.display = 'block'; cursorEl.style.transform = `translate(${f1(s[0])}px, ${f1(s[1])}px)`; } else cursorEl.style.display = 'none';
  let rip = null; for (const e of CUR) if (e.click && t >= e.t && t < e.t + .45) rip = e;
  if (rip) { const s = w2s(rip.x, rip.y, c), x = (t - rip.t) / .45; rippleEl.style.opacity = 1 - x; rippleEl.style.left = f1(s[0] + 4) + 'px'; rippleEl.style.top = f1(s[1] + 6) + 'px'; rippleEl.style.transform = `scale(${(.3 + 1.5 * eo(x)).toFixed(3)})`; } else rippleEl.style.opacity = 0;
  // scribble wipe between chapters: draws in over [c-.4,c], erases over [c,c+.4]
  let off = 1, vis = false;
  for (const w of WIPES) if (t >= w - .4 && t < w + .4) { vis = true; off = t < w ? 1 - eio(seg(t, w - .4, w)) : -eio(seg(t, w, w + .4)); }
  wipeP.style.stroke = LIME; wipeP.style.strokeWidth = 330; wipeP.style.strokeDasharray = '1 1'; wipeP.style.strokeDashoffset = off; wipeP.style.opacity = vis ? 1 : 0;
}

BUILD.push(() => {
  for (const who of 'VB') { AV[who] = new Avatar(who); avl.append(AV[who].root); }
  wipeP.setAttribute('d', zigFill(-260, -160, 2440, 1400, 11));
  for (const w of WIPES) sfx(w - .38, 'whoosh');
  for (const who of 'VB') { const R = INTRO[who]; sfx(R.sk0, 'scribble', R.sk1 - R.sk0); sfx(R.tr0 + .25, 'pop'); }
  for (const l of LINES) if (l.ch !== 'hello' && l.id !== 'L3' && l.id !== 'L9' && l.id !== 'L14' && l.id !== 'L19') { /* hops get a soft whoosh */ }
  for (const id of ['L4', 'L5', 'L6', 'L7', 'L9', 'L11', 'L12', 'L13', 'L15', 'L17', 'L18']) sfx(LT(id) - .9, 'whoosh');
  sfx(LT('L2') - .9, 'whoosh');
  MOVES.sort((x, y) => x.t0 - y.t0);
});

window.render = render;
window.DURATION = window.END;
window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all(['400 40px "Patrick Hand"', '800 100px Archivo', '500 40px Archivo', '700 40px Archivo', '400 20px "JetBrains Mono"', '700 20px "JetBrains Mono"'].map(f => document.fonts.load(f)));
  BUILD.forEach(f => f());
  await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
  SFX.sort((a, b) => a.t - b.t); window.SFX = SFX; window.MARKS = [0, ...WIPES];
})();
