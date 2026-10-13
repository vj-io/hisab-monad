// Scenes A: shots registry, panels, team intro (photo -> sketch-over), problem chapter.
SHOT.ack = { src: 'assets/shots/ack.png', w: 800, h: 250 };
SHOT.offer = { src: 'assets/shots/offer.png', w: 1010, h: 320 };
SHOT.locked = { src: 'assets/shots/locked.png', w: 1010, h: 345 };
SHOT.paid = { src: 'assets/shots/paid.png', w: 740, h: 225 };
SHOT.tier2 = { src: 'assets/shots/tier2.png', w: 1010, h: 480 };
SHOT.explorer = { src: 'assets/shots/explorer.png', w: 755, h: 395 };
SHOT.console = { src: 'assets/shots/console.png', w: 1040, h: 600 };

const INTRO = {};   // who -> placement of the photo frame, for the avatar sketch-over
const W_C1 = (LE('L2') + LT('L3')) / 2, W_C2 = (LE('L7') + LT('L8')) / 2, W_C3 = (LE('L13') + LT('L14')) / 2, W_C4 = (LE('L18') + LT('L19')) / 2;
const WIPES = [W_C1, W_C2, W_C3, W_C4];

// a taped photo: hand-drawn ink frame, slow push-in on the face, then it ghosts out under the avatar's pencil strokes
function photoCard(p, o) {
  const cx = o.fx + o.fw / 2, cy = o.fy + o.fh / 2, out = [o.tSk1 + .1, o.tSk1 + .55];
  const g = svgEl('g', { transform: `rotate(${o.rot} ${cx} ${cy})` }); p.g.append(g);
  const bg = svgEl('rect', { x: o.fx, y: o.fy, width: o.fw, height: o.fh, rx: 4, transform: `rotate(${o.rot} ${cx} ${cy})` });
  bg.style.fill = CARD; p.fills.append(bg); p.tracks.push({ kind: 'op', el: bg, at: o.tFrame, dur: .3, out });
  p.path(rectP(o.fx, o.fy, o.fw, o.fh, 7), o.tFrame, .75, { w: 7, parent: g, pen: true, out });
  // tape
  const tp = svgEl('rect', { x: cx - 70, y: o.fy - 22, width: 140, height: 44, rx: 3, transform: `rotate(${-o.rot * 2 - 3} ${cx} ${o.fy})` });
  tp.style.fill = LIME; tp.style.stroke = INK; tp.style.strokeWidth = 5; p.gT.append(tp);
  p.tracks.push({ kind: 'op', el: tp, at: o.tFrame + .5, dur: .25, out });
  sfx(o.tFrame + .5, 'pop');
  const bw = o.fw - 28, bh = o.fh - 28, asp = bw / bh;
  const wrap = document.createElement('div'); wrap.className = 'photo';
  Object.assign(wrap.style, { left: (o.fx + 14) + 'px', top: (o.fy + 14) + 'px', width: bw + 'px', height: bh + 'px', opacity: 0,
    transformOrigin: `${bw / 2}px ${bh / 2}px`, transform: `rotate(${o.rot}deg)` });
  const img = document.createElement('img'); img.src = o.src; wrap.append(img); p.el.append(wrap);
  p.on(t => {
    const ap = seg(t, o.tIn, o.tIn + .5), sk = seg(t, o.tSk0, o.tSk1);
    wrap.style.opacity = Math.max(0, ap * (1 - .8 * eo(seg(t, o.tSk0, o.tSk0 + .5)) - .2 * seg(t, o.tSk1 - .3, o.tSk1 + .1)));
    wrap.style.filter = sk > 0 ? `grayscale(${sk}) contrast(${1 - .35 * sk}) brightness(${1 + .6 * sk})` : '';
    const k = eio(seg(t, o.tPush0, o.tPush1)), c = { x: lerp(o.c0.x, o.c1.x, k), y: lerp(o.c0.y, o.c1.y, k), w: lerp(o.c0.w, o.c1.w, k) };
    const sc = bw / c.w;
    Object.assign(img.style, { width: (o.nw * sc) + 'px', left: (-c.x * sc) + 'px', top: (-c.y * sc) + 'px' });
  });
  return { wrap, out };
}

BUILD.push(() => {
  const A = PAN.A = new Panel('A', 0, 0), B = PAN.B = new Panel('B', PX, 0);
  PAN.P1 = new Panel('P1', 0, PY); PAN.P2 = new Panel('P2', PX, PY); PAN.P3 = new Panel('P3', 2 * PX, PY); PAN.P4 = new Panel('P4', 2 * PX, 2 * PY); PAN.P5 = new Panel('P5', PX, 2 * PY);
  PAN.Q1 = new Panel('Q1', 0, 3 * PY); PAN.Q2 = new Panel('Q2', PX, 3 * PY); PAN.Q3 = new Panel('Q3', 2 * PX, 3 * PY); PAN.Q4 = new Panel('Q4', 2 * PX, 4 * PY); PAN.Q5 = new Panel('Q5', PX, 4 * PY);
  PAN.R1 = new Panel('R1', 0, 5 * PY); PAN.R2 = new Panel('R2', PX, 5 * PY); PAN.R3 = new Panel('R3', 2 * PX, 5 * PY); PAN.R4 = new Panel('R4', 2 * PX, 6 * PY);
  PAN.S = new Panel('S', PX, 6 * PY);

  // ============================================================ 1. HELLO
  {
    const a = LT('L1');
    A.text(150, 120, 'Hisab on ' + mark('Monad'), 'disp', .05, { dur: .9, pen: true, style: { fontSize: '88px' } });
    A.text(842, 148, 'the team behind it', 'hand', .75, { style: { fontSize: '50px', color: '#3a3833' } });
    const sk0 = a + 2.55, sk1 = a + 4.0;
    const ph = photoCard(A, { src: 'assets/photos/vaibhav_w.jpg', nw: 2000, fx: 190, fy: 300, fw: 520, fh: 600, rot: -2.2,
      c0: { x: 538, y: 69, w: 917 }, c1: { x: 693, y: 189, w: 573 }, tFrame: .2, tIn: .6, tPush0: .65, tPush1: sk0 + .2, tSk0: sk0, tSk1: sk1 });
    INTRO.V = { pan: A, fx: 450, fy: 905, sk0, sk1, tr0: sk1 + .15, tr1: sk1 + .85 };
    const tn = T('L1', 'Vaibhav', -.3);
    A.text(830, 300, 'Vaibhav', 'disp', tn, { anim: 'pop', style: { fontSize: '190px', transformOrigin: 'left bottom' } });
    A.text(830, 480, mark('Jangid'), 'disp', tn + .25, { anim: 'pop', style: { fontSize: '190px', transformOrigin: 'left bottom' } });
    const tc = T('L1', 'co-founder', -.15);
    A.text(838, 720, 'CO-FOUNDER', 'mono chip', tc, { anim: 'pop', style: { fontWeight: 700, transformOrigin: 'left center' } });
    A.path(sparkP(1600, 330, 46), tc + .1, .35, { w: 5 });
    const tr = T('L1', 'I lead product', -.1);
    hand(A, 836, 790, 'Product &amp; Engineering', tr, { fs: 68, pen: true });
    A.path(line(836, 868, 1480, 862, 6), tr + .9, .45, { w: 6 });
    // a hello wave doodle near the title
    A.path(sparkP(1330, 150, 38), .9, .3, { w: 5, quiet: 1 });
  }
  {
    const a = LT('L2'), P = B;
    const sk0 = a + 1.8, sk1 = a + 3.2;
    photoCard(P, { src: 'assets/photos/bhavya.jpg', nw: 976, fx: 1210, fy: 300, fw: 520, fh: 600, rot: 2.0,
      c0: { x: 30, y: 0, w: 900 }, c1: { x: 190, y: 0, w: 590 }, tFrame: a - .65, tIn: a - .2, tPush0: a - .15, tPush1: sk0 + .2, tSk0: sk0, tSk1: sk1 });
    INTRO.B = { pan: P, fx: 1470, fy: 905, sk0, sk1, tr0: sk1 + .15, tr1: sk1 + .85 };
    const tn = T('L2', 'Bhavya', -.3);
    P.text(150, 190, 'Bhavya', 'disp', tn, { anim: 'pop', style: { fontSize: '176px', transformOrigin: 'left bottom' } });
    P.text(150, 356, mark('Dhoot'), 'disp', tn + .25, { anim: 'pop', style: { fontSize: '176px', transformOrigin: 'left bottom' } });
    const tc = T('L2', 'the other co-founder', -.1);
    P.text(158, 548, 'CO-FOUNDER', 'mono chip', tc, { anim: 'pop', style: { fontWeight: 700, transformOrigin: 'left center' } });
    P.path(sparkP(860, 250, 46), tc + .1, .35, { w: 5 });
    const tr = T('L2', 'I build', -.1);
    hand(P, 156, 622, 'Smart Contracts &amp; Backend', tr, { fs: 68, pen: true });
    P.path(line(156, 700, 1000, 694, 6), tr + 1.1, .45, { w: 6 });
  }
  START = { cx: 960, cy: 540, s: 1 };
  move(LT('L2') - 1.1, LT('L2') - .2, [...ctr(B), 1], .38);

  // ============================================================ 2. PROBLEM
  // ---- P1: ships today, paid sixty to ninety days later
  {
    const p = PAN.P1, a = LT('L3'), tA = T('L3', 'but gets paid'), tB = T('L3', 'later');
    tag(p, 'THE PROBLEM', a + .1);
    const s0 = T('L3', "Here's the problem") + .15;
    p.path('M190 410 L570 410 L508 500 L252 500 Z', s0, .8, { w: 6, pen: true });
    p.path(rectP(300, 338, 134, 72, 5), s0 + .55, .4, { w: 5 });
    p.path(rectP(462, 348, 46, 62, 3), s0 + .75, .3, { w: 5, quiet: 1 });
    p.path(rectP(214, 372, 38, 38, 3), s0 + .85, .25, { w: 5, quiet: 1 });
    p.path(`M150 536 q40 -22 80 0 t80 0 t80 0 t80 0 t80 0`, s0 + 1.0, .5, { w: 5 });
    const ts = T('L3', 'ships today', -.25);
    hand(p, 200, 560, 'ships today', ts, { fs: 62, pen: true });
    // the long wait: arrow + ticking days
    const aX0 = 680, aX1 = 1500, ay = 470;
    p.path(arrowP(aX0, ay, aX1, ay, -24, 30), tA - .1, tB - tA + .5, { w: 6, pen: true });
    for (let i = 0; i < 9; i++) p.path(line(aX0 + 40 + i * 88, ay - 22, aX0 + 40 + i * 88, ay + 22, 1), tA + (tB - tA) * i / 9, .15, { w: 4, quiet: 1 });
    p.text(840, 270, mark('60–90 days'), 'hand', T('L3', 'sixty to ninety') - .25, { dur: .8, pen: true, style: { fontSize: '104px' } });
    p.live(900, 548, 'mono', { fontSize: '44px', fontWeight: 700, letterSpacing: '.08em' }, tA, t => 'DAY ' + String(Math.round(90 * eo(seg(t, tA, tB + .3)))).padStart(2, '0'));
    sfx(tA, 'count');
    // the money bag at the far end
    const tb = tB + .15;
    p.path(`M1590 360 Q1560 440 1590 520 Q1650 560 1710 520 Q1740 440 1710 360 Z`, tb, .6, { w: 6, pen: true });
    p.path(line(1600, 350, 1700, 350, 2), tb + .3, .2, { w: 7, quiet: 1 });
    p.path('M1612 350 q-12 -34 12 -30 M1688 350 q12 -34 -12 -30', tb + .4, .3, { w: 5, quiet: 1 });
    p.text(1618, 395, '$', 'mono', tb + .45, { anim: 'pop', style: { fontSize: '96px', fontWeight: 700 } });
    hand(p, 1590, 580, 'paid', tb + .55, { fs: 62 });
    cut(W_C1, foc(p, 560, 470, 1.3));
    move(tA - .35, tA + .9, foc(p, 1160, 440, 1.22));
    move(tB - .1, tB + 1.0, foc(p, 960, 470, 1.0));
  }
  // ---- P2: capital locked in every open invoice; banks finance collateral, not invoices
  {
    const p = PAN.P2, a = LT('L4');
    tag(p, 'THE PROBLEM', a + .05);
    const s0 = T('L4', 'So their') + .1;
    p.path(rectP(200, 190, 310, 340, 7), s0, .7, { w: 6, pen: true });
    p.text(228, 212, 'INVOICE', 'mono', s0 + .5, { anim: 'fade', style: { fontSize: '28px', fontWeight: 700, letterSpacing: '.14em' } });
    p.path(scribLines(228, 285, 240, 5, 42), s0 + .6, .8, { w: 4 });
    p.path(`${circleP(250, 495, 22, 1.05)} ${circleP(250, 480, 22, 1.05)} ${circleP(250, 465, 22, 1.05)}`, s0 + 1.3, .5, { w: 4, quiet: 1 });
    const tl = T('L4', 'locked', -.2);
    p.block(392, 408, 126, 104, tl, { color: LIME, kind: 'popb', origin: 'center', rx: 6 });
    p.path(`M410 408 L410 372 Q455 330 500 372 L500 408`, tl, .35, { w: 9 });
    p.path(rectP(392, 408, 126, 104, 4), tl + .1, .35, { w: 7 });
    p.path(`${circleP(455, 450, 12, 1.05)} ${line(455, 460, 455, 488, 1)}`, tl + .3, .25, { w: 6, quiet: 1 });
    sfx(tl + .15, 'stamp');
    hand(p, 196, 566, mark('capital locked'), T('L4', 'working capital') - .1, { fs: 62, pen: true });
    // banks finance collateral, not invoices
    const tbk = T('L4', 'banks finance') - .5;
    p.path(`M1010 270 L1220 150 L1430 270 Z`, tbk, .7, { w: 6, pen: true });
    p.path(rectP(1030, 270, 380, 34, 3), tbk + .5, .4, { w: 6 });
    for (let i = 0; i < 4; i++) p.path(rectP(1062 + i * 100, 312, 44, 160, 3), tbk + .8 + i * .12, .35, { w: 6, quiet: i > 0 });
    p.path(rectP(1010, 476, 420, 32, 3), tbk + 1.3, .35, { w: 6 });
    p.text(1160, 205, 'BANK', 'mono', tbk + 1.0, { anim: 'pop', style: { fontSize: '26px', fontWeight: 700, letterSpacing: '.16em' } });
    p.path(rectP(780, 330, 130, 170, 5), T('L4', 'not invoices') - .9, .4, { w: 5 });
    p.path(scribLines(796, 372, 98, 3, 34), T('L4', 'not invoices') - .5, .4, { w: 3, quiet: 1 });
    p.path(crossP(768, 316, 160), T('L4', 'not invoices') - .1, .45, { w: 11 });
    const tc = T('L4', 'collateral', -.2);
    p.path('M1580 392 L1680 312 L1780 392', tc, .4, { w: 6 });
    p.path(rectP(1600, 392, 160, 120, 4), tc + .35, .4, { w: 6 });
    p.path(rectP(1664, 440, 36, 72, 2), tc + .6, .25, { w: 5, quiet: 1 });
    p.path(checkP(1700, 250, 76), tc + .85, .35, { w: 11 });
    hand(p, 1560, 540, 'collateral', tc + .5, { fs: 54 });
    move(a + .4, a + 1.3, foc(p, 700, 400, 1.2));
    move(tbk - .2, tbk + 1.0, foc(p, 1300, 380, 1.2));
  }
  // ---- P3: small tickets cost more than they earn (a scale tips)
  {
    const p = PAN.P3, a = LT('L5');
    tag(p, 'THE PROBLEM', a + .05);
    hand(p, 700, 128, 'small tickets', a + .05, { fs: 66, pen: true });
    const px0 = 960, py0 = 330, L = 330;
    p.path(line(px0, py0, px0, 560, 3), a + .3, .45, { w: 8, pen: true });
    p.path(line(840, 560, 1080, 560, 3), a + .6, .3, { w: 8 });
    const beam = p.path(line(px0 - L, py0, px0 + L, py0, 0), a + .75, .45, { w: 8 });
    p.path(circleP(px0, py0, 18, 1.03), a + .9, .25, { w: 6, quiet: 1 });
    const mkPan = (x0) => {
      const g = svgEl('g'); p.g.append(g);
      p.path('M-96 130 Q0 190 96 130 Z', a + 1.0, .45, { w: 6, parent: g });
      p.path(`${line(0, 0, -86, 130, 1)} ${line(0, 0, 86, 130, 1)}`, a + 1.1, .35, { w: 4, parent: g, quiet: 1 });
      return g;
    };
    const gL = mkPan(), gR = mkPan();
    // left pan: paperwork; right pan: a single coin
    const stackL = svgEl('g'); gL.append(stackL);
    p.path(rectP(-70, 60, 90, 66, 3), a + 1.4, .3, { w: 5, parent: stackL, quiet: 1 });
    p.path(rectP(-30, 40, 90, 86, 3), a + 1.5, .3, { w: 5, parent: stackL, quiet: 1 });
    p.path(scribLines(-14, 62, 60, 3, 18), a + 1.65, .3, { w: 3, parent: stackL, quiet: 1 });
    p.path(circleP(0, 108, 20, 1.05), a + 1.7, .3, { w: 5, parent: gR, quiet: 1 });
    const lbL = hand(p, 0, 0, 'cost', T('L5', 'cost more') - .15, { fs: 66, anim: 'pop' });
    const lbR = hand(p, 0, 0, 'earn', T('L5', 'than they earn') - .1, { fs: 66, anim: 'pop' });
    const tT = T('L5', 'cost more') - .1;
    p.on(t => {
      const x = t - tT, ang = x <= 0 ? 0 : .2 * spring(x * .95);
      const lx = px0 - L * Math.cos(ang), ly = py0 + L * Math.sin(ang), rx = px0 + L * Math.cos(ang), ry = py0 - L * Math.sin(ang);
      beam.setAttribute('d', `M${f1(lx)} ${f1(ly)} L${f1(rx)} ${f1(ry)}`);
      gL.setAttribute('transform', `translate(${f1(lx)} ${f1(ly)})`); gR.setAttribute('transform', `translate(${f1(rx)} ${f1(ry)})`);
      lbL.style.left = (lx - 68) + 'px'; lbL.style.top = (ly + 195) + 'px'; lbR.style.left = (rx - 70) + 'px'; lbR.style.top = (ry + 195) + 'px';
    });
    p.text(180, 232, 'underwrite', 'mono chip', T('L5', 'underwrite') - .1, { anim: 'pop', style: { transformOrigin: 'left center' } });
    p.text(180, 330, 'reconcile', 'mono chip', T('L5', 'reconcile') - .1, { anim: 'pop', style: { transformOrigin: 'left center' } });
    sfx(tT + .1, 'thud');
  }
  // ---- P4: lenders stay away: no shared record, same invoice pledged twice
  {
    const p = PAN.P4, a = LT('L6');
    tag(p, 'THE PROBLEM', a + .05);
    const t0 = T('L6', 'Lenders stay away') - .1;
    p.path(personP(300, 300, 1.15), t0, .9, { w: 6, pen: true });
    p.path(circleP(420, 470, 36, 1.05), t0 + .6, .35, { w: 5, quiet: 1 });
    p.text(399, 440, '$', 'mono', t0 + .8, { anim: 'pop', style: { fontSize: '56px', fontWeight: 700 } });
    hand(p, 160, 540, 'stay away', T('L6', 'stay away') + .1, { fs: 56 });
    // a ledger nobody can read
    const t1 = T('L6', 'no shared record') - .2;
    p.block(600, 250, 270, 340, t1 + .1, { color: INK, kind: 'op', dur: .3, rx: 6 });
    p.path(rectP(600, 250, 270, 340, 6), t1, .6, { w: 7, pen: true });
    p.path(line(640, 250, 640, 590, 2), t1 + .4, .3, { w: 5, color: PAPER, quiet: 1 });
    p.text(700, 330, '?', 'disp', t1 + .55, { anim: 'pop', style: { fontSize: '220px', color: PAPER } });
    hand(p, 560, 612, 'paid? nobody sees', T('L6', 'whether past invoices') - .1, { fs: 50 });
    // the same invoice, pledged twice
    const t2 = T('L6', 'the same invoice') - .1;
    p.path(rectP(1130, 270, 190, 250, 6), t2, .6, { w: 7, pen: true });
    p.text(1156, 288, 'INV', 'mono', t2 + .4, { anim: 'fade', style: { fontSize: '26px', fontWeight: 700 } });
    p.path(scribLines(1156, 350, 140, 4, 34), t2 + .5, .6, { w: 3 });
    const tw = T('L6', 'pledged twice') - .2;
    p.path(arrowP(1340, 340, 1520, 300, -20, 26), tw, .4, { w: 6, pen: true });
    p.path(arrowP(1340, 450, 1520, 480, 20, 26), tw + .3, .4, { w: 6 });
    p.path(personP(1600, 250, .7), tw + .1, .5, { w: 5, quiet: 1 });
    p.path(personP(1600, 400, .7), tw + .4, .5, { w: 5, quiet: 1 });
    p.stamp(1300, 560, 'TWICE', tw + .9, { rot: -7, fs: 80 });
    move(t0 - .1, t0 + .8, foc(p, 520, 430, 1.18));
    move(t1 - .5, t1 + .7, foc(p, 760, 440, 1.2));
    move(t2 - .6, t2 + .8, foc(p, 1400, 420, 1.18));
  }
  // ---- P5: the trade-finance gap
  {
    const p = PAN.P5, a = LT('L7');
    tag(p, 'THE PROBLEM', a + .05);
    p.text(330, 150, mark('trade-finance gap'), 'disp', T('L7', 'trade-finance') - .3, { dur: .9, pen: true, style: { fontSize: '118px' } });
    const t0 = a + .35;
    p.path('M130 470 L700 470 L684 540 L706 600 L640 660 L130 660', t0, .9, { w: 7, pen: true });
    p.path('M1220 470 L1790 470 L1790 660 L1270 660 L1210 600 L1236 540 Z', t0 + .5, .9, { w: 7, pen: true });
    p.path(scribLines(160, 520, 400, 3, 44), t0 + 1.0, .6, { w: 3, quiet: 1 });
    p.path(scribLines(1300, 520, 400, 3, 44), t0 + 1.2, .6, { w: 3, quiet: 1 });
    p.path(personP(330, 290, 1.0), t0 + .6, .7, { w: 6, pen: true });
    p.path(rectP(410, 380, 74, 92, 3), t0 + 1.2, .35, { w: 5, quiet: 1 });
    p.path(personP(1560, 290, 1.0), t0 + .9, .7, { w: 6 });
    p.path(circleP(1690, 430, 36, 1.05), t0 + 1.4, .35, { w: 5, quiet: 1 });
    p.text(1672, 400, '$', 'mono', t0 + 1.6, { anim: 'pop', style: { fontSize: '56px', fontWeight: 700 } });
    const tq = T('L7', 'estimated') - .1;
    p.path(`M740 430 Q960 330 1180 430`, tq, .7, { w: 6, pen: true });
    p.path(`M1150 395 L1182 432 L1138 440`, tq + .6, .25, { w: 6, quiet: 1 });
    p.text(918, 365, '?', 'disp', tq + .5, { anim: 'pop', style: { fontSize: '120px' } });
    const tt = T('L7', 'in the trillions') - .1;
    hand(p, 470, 268, mark('≈ trillions of dollars (est.)'), tt, { fs: 66, pen: true });
    sfx(tt + .9, 'thud');
    move(a + .5, a + 1.6, foc(p, 960, 400, 1.1));
    move(tt - .2, tt + 1.2, foc(p, 960, 380, 1.05));
  }
  // hops between problem panels
  const hop = (id, to) => move(LT(id) - 1.15, LT(id) + .05, [...ctr(PAN[to]), 1], .42);
  hop('L4', 'P2'); hop('L5', 'P3'); hop('L6', 'P4'); hop('L7', 'P5');
  // the camera's first pose in each panel is set by its own moves; a hop leaves it centred
});
