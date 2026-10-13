// Scenes C: why we are building it (and why Monad), then the close.
BUILD.push(() => {
  const hopTo = (id, to, s = 1) => move(LT(id) - 1.15, LT(id) + .05, [...ctr(PAN[to]), s], .42);

  // ---- R1: the original Hisab only recorded entitlements
  {
    const p = PAN.R1, a = LT('L14');
    tag(p, 'WHY WE BUILT IT', a + .05);
    const t0 = T('L14', 'matched messy') - .5;
    p.path(rectP(170, 230, 380, 260, 6), t0, .7, { w: 6, pen: true });
    p.text(196, 246, 'SWIFT MT103', 'mono chip', t0 + .45, { anim: 'pop', style: { transformOrigin: 'left center', fontWeight: 700 } });
    p.text(196, 330, 'INV 2O24-OO91', 'mono', t0 + .7, { dur: .9, pen: true, style: { fontSize: '32px', fontWeight: 500 } });
    p.path(scribLines(196, 392, 300, 3, 34), t0 + 1.0, .6, { w: 3 });
    hand(p, 196, 508, 'messy', T('L14', 'messy') + .15, { fs: 56, rot: -3 });
    const t1 = T('L14', 'to shipments') - .3;
    p.path(arrowP(570, 360, 690, 360, -20, 26), t1, .4, { w: 6 });
    p.path(rectP(710, 280, 200, 170, 5), t1 + .3, .5, { w: 7, pen: true });
    p.path(`${line(710, 280, 910, 450, 3)} ${line(910, 280, 710, 450, 3)}`, t1 + .6, .35, { w: 5, quiet: 1 });
    p.text(770, 358, 'SB', 'mono', t1 + .8, { anim: 'pop', style: { fontSize: '52px', fontWeight: 700, background: CARD } });
    p.checkBadge(910, 270, 30, t1 + 1.1);
    const t2 = T('L14', 'It only recorded') - .2;
    p.path(arrowP(950, 360, 1060, 360, -20, 26), t2, .4, { w: 6 });
    p.path(rectP(1080, 220, 640, 330, 6), t2 + .25, .7, { w: 7, pen: true });
    p.text(1108, 238, 'ENTITLEMENTS', 'mono', t2 + .7, { anim: 'fade', style: { fontSize: '26px', fontWeight: 700, letterSpacing: '.14em' } });
    for (let i = 0; i < 4; i++) {
      const y = 300 + i * 56;
      p.path(line(1108, y + 44, 1690, y + 44, 2), t2 + .8 + i * .15, .25, { w: 3, quiet: 1 });
      p.block(1112, y + 8, 220 + i * 40, 22, t2 + .9 + i * .15, { color: INK, dur: .25 });
    }
    p.stamp(1230, 585, 'RECORD ONLY', T('L14', 'entitlements') - .1, { rot: -5, fs: 56 });
    cut(W_C3, [...ctr(p), 1]);
    move(t0 - .1, t0 + 1.0, foc(p, 520, 400, 1.2));
    move(t1 - .2, t1 + .8, foc(p, 900, 400, 1.15));
    move(t2 - .1, t2 + .9, foc(p, 1340, 420, 1.12));
  }
  // ---- R2: on Monad the money itself moves, in AUSD; 400 ms blocks; fees low enough for a $10,000 invoice
  {
    const p = PAN.R2, a = LT('L15');
    tag(p, 'WHY MONAD', a + .05);
    const t0 = T('L15', 'the money itself moves') - .5;
    p.path(rectP(170, 250, 200, 250, 6), t0, .6, { w: 7, pen: true });
    p.block(176, 360, 188, 134, t0 + .4, { color: LIME, kind: 'growY', origin: 'center bottom', rx: 3 });
    p.text(176, 198, 'POOL', 'mono chip', t0 + .3, { anim: 'pop', style: { transformOrigin: 'left center' } });
    p.path(arrowP(400, 380, 740, 380, -26, 28), t0 + .5, .5, { w: 7, pen: true });
    p.path(rectP(760, 300, 160, 150, 6), t0 + .8, .5, { w: 7 });
    p.text(782, 250, 'EXPORTER', 'mono', t0 + 1.0, { anim: 'fade', style: { fontSize: '24px', fontWeight: 700, letterSpacing: '.1em' } });
    const tm = T('L15', 'in A U S D') - .2;
    for (let i = 0; i < 8; i++) p.fly('A', [330, 360], [560, 270 - (i % 2) * 40], [790, 380], tm + i * .5, .95, { cls: 'coin', out: [LE('L16') + .1, LE('L16') + .5] });
    sfx(tm, 'coins');
    p.text(450, 440, '<span class="mk"><i></i>AUSD</span>', 'disp', tm + .1, { anim: 'pop', style: { fontSize: '84px', transformOrigin: 'left center' } });
    // 400 ms blocks
    const tb = T('L15', 'Blocks take') - .2;
    for (let i = 0; i < 4; i++) {
      const x = 1010 + i * 150;
      p.path(rectP(x, 300, 104, 104, 4), tb + i * .22, .35, { w: 6, quiet: i > 0, pen: i === 0 });
      p.block(x + 6, 306, 92, 92, tb + .1 + i * .22, { color: i === 3 ? LIME : CARD, kind: 'popb', origin: 'center', rx: 3, dur: .3 });
      if (i < 3) p.path(arrowP(x + 112, 352, x + 142, 352, -4, 14), tb + .15 + i * .22, .2, { w: 5, quiet: 1 });
    }
    p.text(1010, 150, mark('400 ms'), 'disp', T('L15', 'four hundred') - .2, { anim: 'pop', style: { fontSize: '120px', transformOrigin: 'left center' } });
    // stopwatch
    p.path(circleP(1720, 360, 78, 1.05), tb + .2, .6, { w: 7 });
    p.path(line(1700, 266, 1740, 266, 1), tb + .6, .2, { w: 8, quiet: 1 });
    const hnd = p.path(line(1720, 360, 1720, 308, 0), tb + .8, .2, { w: 7, quiet: 1 });
    p.on(t => { const k = (t - tb) * 2.4 * Math.PI; hnd.setAttribute('d', `M1720 360 L${f1(1720 + Math.sin(k) * 50)} ${f1(360 - Math.cos(k) * 50)}`); });
    // fees low enough for a $10,000 invoice
    const tf = T('L16', 'And fees') - .2;
    p.path(rectP(960, 500, 300, 110, 6), tf, .5, { w: 7, pen: true });
    p.text(990, 520, '$10,000', 'disp', tf + .35, { anim: 'pop', style: { fontSize: '66px', transformOrigin: 'left center' } });
    p.path(arrowP(1285, 555, 1380, 555, -10, 22), tf + .5, .3, { w: 6 });
    p.path(circleP(1440, 555, 28, 1.05), tf + .75, .3, { w: 6 });
    p.text(1424, 538, '$', 'mono', tf + .9, { anim: 'pop', style: { fontSize: '32px', fontWeight: 700 } });
    hand(p, 1490, 528, mark('tiny fee'), T('L16', 'low enough') - .1, { fs: 54 });
    hopTo('L15', 'R2');
    move(t0 - .1, t0 + .9, foc(p, 640, 380, 1.15));
    move(tb - .35, tb + .8, foc(p, 1300, 360, 1.1));
    move(tf - .3, tf + .9, foc(p, 1220, 470, 1.08));
  }
  // ---- R3: a shared onchain credit record lenders can price from
  {
    const p = PAN.R3, a = LT('L17');
    const ts = a + .15, sh = p.shot('explorer', 170, 200, 700, ts, { pen: true });
    hand(p, 176, 126, 'every invoice: a public record', T('L17', 'shared onchain') - .2, { fs: 50 });
    const tl = T('L17', 'to price from') - .5;
    // tier ladder: the record sets the price
    const steps = [['T0', '14%'], ['T1', '12.5%'], ['T2', '11.5%'], ['T3', '10%']];
    steps.forEach(([lab, apr], i) => {
      const x = 1000 + i * 190, top = 460 - i * 80, at = tl + i * .28;
      p.path(rectP(x, top, 170, 570 - top, 4), at, .4, { w: 6, pen: i === 0 });
      p.text(x + 36, top + 8, lab, 'mono', at + .2, { anim: 'pop', style: { fontSize: '34px', fontWeight: 700 } });
      p.text(x + 26, top + 54, apr, 'hand', at + .3, { anim: 'fade', style: { fontSize: '40px' } });
    });
    p.text(1000, 586, 'APR  (lower as the record grows)', 'mono', tl + .2, { anim: 'fade', style: { fontSize: '24px', letterSpacing: '.16em', color: MUTED } });
    p.path(arrowP(1020, 420, 1720, 190, 80, 30), T('L17', 'next offer') - .3, .7, { w: 8, pen: true });
    hand(p, 1010, 150, mark('cheaper'), T('L17', 'cheaper') - .15, { fs: 78, anim: 'pop' });
    hopTo('L17', 'R3');
    move(ts + .4, ts + 1.3, frame(p, { x: sh.x - 20, y: 180, w: sh.w + 40, h: sh.h - 30 }, 1.5));
    move(tl - .3, tl + .9, foc(p, 1300, 380, 1.1));
  }
  // ---- R4: live on Monad testnet today
  {
    const p = PAN.R4, a = LT('L18');
    const ts = a - .35, sh = p.shot('console', 480, 120, 760, ts, { pen: true });
    const tl = T('L18', 'live') - .1;
    p.stamp(1310, 190, 'LIVE', tl, { rot: -8, fs: 120 });
    p.text(1310, 400, 'MONAD TESTNET', 'mono chip', tl + .35, { anim: 'pop', style: { transformOrigin: 'left center', fontWeight: 700 } });
    p.path(sparkP(330, 330, 50), tl + .5, .3, { w: 6 });
    p.path(sparkP(1560, 520, 44), tl + .6, .3, { w: 6 });
    hopTo('L18', 'R4');
    move(tl - .3, tl + 1.2, frame(p, { x: 420, y: 110, w: 1180, h: 540 }, 1.25));
  }
  // the hop from R1 -> R2 -> R3 -> R4 happens with the lines above; each stays centred on arrival

  // ============================================================ close
  {
    const p = PAN.S, a = LT('L19'), hf = a + .95;
    p.text(250, 130, mark('Hisab on Monad.'), 'disp', a - .15, { dur: 1.0, pen: true, style: { fontSize: '170px' } });
    const tu = hf + .35;
    hand(p, 560, 360, 'hisab-monad.vercel.app', tu, { fs: 86, dur: 1.5, pen: true });
    p.path(line(560, 478, 1370, 472, 6), tu + 1.4, .5, { w: 6 });
    p.path(sparkP(300, 440, 52), a + .4, .3, { w: 6 });
    p.path(sparkP(1650, 150, 46), a + .6, .3, { w: 6 });
    p.path(burstP(960, 725, 56, 130, 14), hf, .4, { w: 7, top: true, quiet: 1 });
    p.block(960 - 56, 725 - 56, 112, 112, hf, { rx: 56, kind: 'popb', origin: 'center', color: LIME, dur: .45 });
    sfx(hf, 'pop'); sfx(hf + .05, 'confetti');
    [[420, 560, 40], [1500, 560, 44], [700, 290, 30], [1260, 290, 34]].forEach(([x, y, s], i) => p.path(sparkP(x, y, s), hf + .3 + i * .22, .3, { w: 5, quiet: i > 1 }));
    cut(W_C4, [...ctr(p), 1]);
  }
  // sort the camera timeline (scenes added moves out of order)
  MOVES.sort((x, y) => x.t0 - y.t0);
});
