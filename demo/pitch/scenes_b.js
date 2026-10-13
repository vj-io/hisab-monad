// Scenes B: the product, told on real stills from the live run (zoomed on the exact number being said).
const cur = (p, t, x, y, click) => CUR.push({ t, x: p.px + x, y: p.py + y, click, pan: p.name });
const ELL = (cx, cy, rx, ry) => ellipseP(cx, cy, rx, ry);

BUILD.push(() => {
  const hopTo = (id, to, s = 1) => move(LT(id) - 1.15, LT(id) + .05, [...ctr(PAN[to]), s], .42);

  // ---- Q1: shipping bill tokenised, buyer acknowledges with a signature
  {
    const p = PAN.Q1, a = LT('L8');
    p.text(160, 122, 'Hisab on ' + mark('Monad'), 'disp', a + .1, { dur: .9, pen: true, style: { fontSize: '96px' } });
    const tb = T('L8', 'The shipping bill') - .3;
    p.path(rectP(170, 330, 230, 290, 6), tb, .6, { w: 6, pen: true });
    p.text(190, 348, 'SB 6674321', 'mono', tb + .4, { anim: 'fade', style: { fontSize: '26px', fontWeight: 700 } });
    p.path(scribLines(192, 410, 186, 5, 38), tb + .5, .7, { w: 4 });
    const tt = T('L8', 'tokenised') - .3;
    p.path(arrowP(420, 470, 508, 470, -18, 24), tt, .35, { w: 6 });
    p.path(circleP(610, 470, 86, 1.05), tt + .2, .6, { w: 7, pen: true });
    p.path(circleP(610, 470, 62, 1.05), tt + .5, .4, { w: 4, quiet: 1 });
    p.text(572, 436, 'SB', 'mono', tt + .6, { anim: 'pop', style: { fontSize: '56px', fontWeight: 700 } });
    hand(p, 524, 582, 'tokenised', tt + .7, { fs: 52 });
    const ts = T('L8', 'buyer acknowledges') - .7;
    p.path(arrowP(715, 460, 812, 440, -14, 22), ts - .15, .3, { w: 6, quiet: 1 });
    const sh = p.shot('ack', 830, 285, 920, ts, { pen: true });
    hand(p, 1030, 132, mark('buyer signs'), ts + .5, { fs: 56 });
    const btn = sh.map(97, 221, 250, 78), tClick = T('L8', 'with a signature') - .35;
    cur(p, ts + 1.0, 1350, 640); cur(p, tClick - .45, btn.x + 120, btn.y + 110); cur(p, tClick, btn.x + btn.w * .5, btn.y + btn.h * .55, true);
    p.checkBadge(btn.x + btn.w + 52, btn.y + btn.h * .5, 30, tClick + .15);
    p.path(squigP(btn.x + btn.w + 130, btn.y + btn.h * .5 + 6, 250, 24), tClick + .3, .8, { w: 7, top: true, pen: true });
    cut(W_C2, [...ctr(p), 1]);
    move(ts + .5, ts + 1.4, frame(p, { x: sh.x - 40, y: 120, w: sh.w + 80, h: sh.y + sh.h - 110 }, 1.5));
    move(tClick - .7, tClick - .1, frame(p, { x: btn.x - 40, y: btn.y - 30, w: 700, h: 190 }, 2.0));
    move(tClick + 1.2, tClick + 2.0, frame(p, { x: sh.x - 40, y: 120, w: sh.w + 80, h: sh.y + sh.h - 110 }, 1.5));
  }
  // ---- Q2: a lender pool advances AUSD the day the goods ship, priced by credit tier; accept in one click
  {
    const p = PAN.Q2, a = LT('L9'), b = LT('L10');
    const t0 = a + .1;
    p.path(rectP(170, 270, 230, 300, 6), t0, .7, { w: 7, pen: true });
    p.block(176, 440, 218, 124, t0 + .5, { color: LIME, kind: 'growY', origin: 'center bottom', rx: 3, dur: .8 });
    p.text(176, 212, 'LENDER POOL', 'mono chip', t0 + .35, { anim: 'pop', style: { transformOrigin: 'left center' } });
    p.path(`M176 440 q22 -14 44 0 t44 0 t44 0 t44 0 t44 0`, t0 + .9, .5, { w: 5, quiet: 1 });
    const tc = T('L9', 'advances A U S D') - .15;
    const sh = p.shot('offer', 730, 190, 1060, tc + .05, { pen: true });
    const nr = sh.map(90, 215, 430, 105);          // the 39,000.00
    [0, 1, 2].forEach(i => p.fly('A', [300 + i * 10, 430], [520, 250 - i * 30], [nr.x + 60 + i * 30, nr.y + nr.h * .5], tc + .35 + i * .3, .85, { cls: 'coin', style: {}, out: [tc + 2.2, tc + 2.5] }));
    sfx(tc + .4, 'coins');
    // the day the goods ship
    const tg = T('L9', 'the day the goods ship') - .1;
    p.path('M440 330 L640 330 L600 392 L478 392 Z', tg, .6, { w: 6, pen: true });
    p.path(rectP(500, 280, 70, 50, 3), tg + .4, .3, { w: 5, quiet: 1 });
    p.path(`M420 420 q30 -16 60 0 t60 0 t60 0 t60 0`, tg + .6, .4, { w: 5, quiet: 1 });
    hand(p, 440, 450, 'same day', tg + .6, { fs: 54 });
    // priced by the exporter's onchain credit tier
    const tp = T('L9', 'priced by') - .1;
    const nt = sh.map(75, 335, 450, 44);
    p.path(ELL(nt.x + nt.w * .5, nt.y + nt.h * .5, nt.w * .62, nt.h * 1.0), tp + .2, .6, { w: 6, top: true, pen: true });
    hand(p, 744, 118, 'tier 1: ' + mark('80%') + ' · 12.5% APR', tp + .35, { fs: 52 });
    // the demo number, then accept in one click
    const tn = T('L10', 'thirty-nine thousand') - .35, tClick = T('L10', 'one click') - .2;
    p.path(ELL(nr.x + nr.w * .42, nr.y + nr.h * .5, nr.w * .5, nr.h * .75), tn + .4, .6, { w: 7, top: true, pen: true });
    const ab = sh.map(53, 492, 230, 77);
    cur(p, tn + .2, nr.x + 380, nr.y + nr.h + 160); cur(p, tClick - .5, ab.x + 90, ab.y + 100); cur(p, tClick, ab.x + ab.w * .5, ab.y + ab.h * .5, true);
    p.fly('+39,000 AUSD', [330, 380], [560, 140], [ab.x + 360, ab.y + 60], tClick + .1, .9, { cls: 'chipfly', stay: true, out: [b + 4.3, b + 4.7] });
    p.stamp(1430, 560, 'SENT', tClick + .95, { rot: -6, fs: 74 });
    hopTo('L9', 'Q2');
    move(tc - .3, tc + .9, frame(p, { x: 150, y: 120, w: 1640, h: 480 }, 1.0));
    move(tn - .5, tn + .6, frame(p, { x: nr.x - 20, y: nr.y - 70, w: 760, h: 260 }, 2.2));
    move(tClick - .7, tClick - .1, frame(p, { x: ab.x - 40, y: ab.y - 280, w: 620, h: 420 }, 1.9));
    move(tClick + 1.3, tClick + 2.1, frame(p, { x: 150, y: 120, w: 1640, h: 480 }, 1.0));
  }
  // ---- Q3: the same bill twice is refused by the contract
  {
    const p = PAN.Q3, a = LT('L11');
    const ts = a + .1, sh = p.shot('locked', 410, 150, 1100, ts, { pen: true });
    const fb = sh.map(306, 393, 260, 77), rb = sh.map(50, 502, 1917, 75);
    const tClick = T('L11', 'twice') + .15;
    cur(p, ts + .9, fb.x + 700, fb.y + 220); cur(p, tClick - .5, fb.x + 160, fb.y + 100); cur(p, tClick, fb.x + fb.w * .5, fb.y + fb.h * .5, true);
    const tr = tClick + .35;
    p.path(rectP(rb.x - 8, rb.y - 10, rb.w + 16, rb.h + 20, 5), tr, .7, { w: 7, top: true, pen: true });
    hand(p, 420, 606, 'same bill, twice?', tr + .5, { fs: 52 });
    p.stamp(1000, 600, 'BLOCKED', T('L11', 'Double financing') - .1, { rot: -5, fs: 80 });
    hopTo('L11', 'Q3');
    move(ts + .5, ts + 1.3, frame(p, { x: 410, y: 150, w: 1100, h: sh.h }, 1.5));
    move(tClick - .8, tClick - .2, frame(p, { x: fb.x - 60, y: fb.y - 20, w: 620, h: 180 }, 2.2));
    move(tClick + .2, tClick + .9, frame(p, { x: rb.x - 20, y: rb.y - 30, w: rb.w + 40, h: rb.h + 70 }, 2.0));
    move(tr + 1.6, tr + 2.4, frame(p, { x: 410, y: 150, w: 1100, h: sh.h + 120 }, 1.4));
  }
  // ---- Q4: one transaction splits the payment three ways
  {
    const p = PAN.Q4, a = LT('L12');
    const ts = a + .1, sh = p.shot('paid', 430, 150, 1060, ts, { pen: true });
    const legs = [[265, 'repays the pool', 'repays pool'], [740, 'takes the fee', 'fee'], [1215, 'pays the exporter', 'exporter']];
    const ps = sh.map(588, 29, 304, 214);
    p.text(ps.x + ps.w + 60, ps.y + 4, 'ONE TX', 'mono chip lime', T('L12', 'one transaction') - .1, { anim: 'pop', style: { fontWeight: 700, transformOrigin: 'left center', border: '4px solid #0a0a0a' } });
    legs.forEach(([cx, ph, lab], i) => {
      const n = sh.map(cx - 105, 338, 210, 30), tw = T('L12', ph) - .1;
      p.path(ELL(n.x + n.w / 2, n.y + n.h / 2 + 2, n.w * .6, n.h * .95), tw, .55, { w: 6, top: true, pen: true });
      hand(p, n.x + n.w / 2 - 80, 548, lab, tw + .25, { fs: 46 });
      move(tw - .35, tw + .45, frame(p, { x: n.x - 120, y: n.y - 180, w: n.w + 240, h: 340 }, 1.9));
    });
    hopTo('L12', 'Q4');
    move(ts + .5, ts + 1.2, frame(p, { x: 430, y: 150, w: 1060, h: sh.h }, 1.5));
    move(LE('L12') - .25, LE('L12') + .7, frame(p, { x: 430, y: 150, w: 1060, h: sh.h + 90 }, 1.4));
  }
  // ---- Q5: paid on time, the exporter moves up a tier
  {
    const p = PAN.Q5, a = LT('L13');
    const ts = a + .1, sh = p.shot('tier2', 540, 125, 880, ts, { pen: true });
    const th = sh.map(1050, 170, 900, 150), n88 = sh.map(1235, 200, 135, 70), rows = sh.map(1030, 330, 970, 130);
    const tu = T('L13', 'moves up a tier') - .1;
    p.path(ELL(n88.x + n88.w * .5, n88.y + n88.h * .5, n88.w * .75, n88.h * .75), tu + .3, .6, { w: 7, top: true, pen: true });
    const ts2 = sh.map(1620, 22, 330, 90); p.stamp(ts2.x, ts2.y, 'TIER UP', tu + .6, { rot: -6, fs: 40 });
    const tz = T('L13', 'Eighty percent') - .1, te = T('L13', 'eighty-eight') - .15;
    hand(p, 150, 250, '80%', tz, { fs: 110 });
    p.path(line(140, 330, 330, 290, 3), tz + .5, .3, { w: 8 });
    p.path(arrowP(230, 380, 230, 470, 14, 26), te - .25, .4, { w: 7, pen: true });
    hand(p, 150, 490, mark('88%'), te, { fs: 120, anim: 'pop' });
    hopTo('L13', 'Q5');
    move(ts + .5, ts + 1.3, frame(p, { x: 150, y: 125, w: 1270, h: sh.h }, 1.3));
    move(tu - .4, tu + .5, frame(p, { x: th.x - 20, y: th.y - 40, w: th.w + 40, h: th.h + 40 }, 2.0));
    move(te + .7, te + 1.5, frame(p, { x: rows.x - 20, y: rows.y - 40, w: rows.w + 40, h: rows.h + 60 }, 1.9));
  }
});
