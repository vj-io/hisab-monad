// Renders Doodle-style overlay sprites (transparent PNG, 2x) from labels.json -> ov/*.png (+ ov/sizes.json):
// callout labels, the cold-open title, the end card, the preview note and every state of the persistent checklist.
import { chromium } from 'playwright';
import fs from 'node:fs';
const items = JSON.parse(fs.readFileSync('labels.json', 'utf8'));
fs.mkdirSync('ov', { recursive: true });
const css = `
:root{--paper:#f0ede8;--ink:#0a0a0a;--lime:#c8ff00}
*{box-sizing:border-box;margin:0}
body{background:transparent;font-family:'Archivo',sans-serif;color:var(--ink);padding:14px;display:inline-block}
.lbl{display:inline-flex;align-items:stretch;background:var(--paper);border:4px solid var(--ink);border-radius:14px;box-shadow:7px 7px 0 var(--ink);overflow:hidden}
.lbl .tab{width:18px;background:var(--lime);border-right:4px solid var(--ink)}
.lbl .t{padding:12px 26px 12px 20px;font-weight:800;font-size:42px;letter-spacing:-1px;line-height:1.1;white-space:nowrap}
.lbl .t small{display:block;font-family:'Patrick Hand',cursive;font-weight:400;font-size:26px;letter-spacing:0;color:#444;margin-top:2px;white-space:normal;max-width:760px}
.note .t{font-size:38px}
.note{border-style:dashed;background:#fbffe0}
.title{display:inline-block;background:var(--paper);border:4px solid var(--ink);border-radius:16px;padding:14px 32px;box-shadow:8px 8px 0 var(--ink)}
.title h1{font-weight:800;font-size:76px;letter-spacing:-3px;line-height:1}
.title h1 span,.end h1 span{background:linear-gradient(transparent 58%,var(--lime) 58% 92%,transparent 92%);padding:0 8px}
.title p{font-family:'Patrick Hand',cursive;font-size:34px;margin-top:4px}
.end{display:inline-flex;align-items:center;gap:40px;background:var(--paper);border:5px solid var(--ink);border-radius:18px;padding:16px 38px;box-shadow:10px 10px 0 var(--ink)}
.end h1{font-weight:800;font-size:66px;letter-spacing:-2px;line-height:1;white-space:nowrap}
.end .h{font-family:'Patrick Hand',cursive;font-size:28px;margin-top:6px;white-space:nowrap}
.end .urls{display:flex;flex-direction:column;gap:8px}
.end .u{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:30px;background:#fff;border:4px solid var(--ink);border-radius:10px;padding:4px 16px;width:fit-content;white-space:nowrap}
.ck{width:410px;background:var(--paper);border:4px solid var(--ink);border-radius:14px;box-shadow:7px 7px 0 var(--ink);padding:12px 18px 14px}
.ck .h{font-family:'Patrick Hand',cursive;font-size:23px;color:#555;line-height:1;margin-bottom:8px}
.ck .row{display:flex;align-items:flex-start;gap:14px;margin-top:8px}
.ck .bx{flex:none;width:36px;height:36px;margin-top:1px;border:4px solid var(--ink);border-radius:8px;background:#fff;position:relative}
.ck .bx svg{position:absolute;left:-6px;top:-10px;width:46px;height:46px;overflow:visible}
.ck .tx{font-weight:800;font-size:28px;letter-spacing:-.6px;line-height:1.2;white-space:nowrap}
.ck .tx .s{display:inline-block;background-repeat:no-repeat;background-image:linear-gradient(transparent 50%,var(--lime) 50% 94%,transparent 94%);padding:0 4px;margin:0 -4px}
.ck .tx small{display:block;font-family:'Patrick Hand',cursive;font-weight:400;font-size:23px;letter-spacing:0;color:#444;line-height:1}
`;
const head = `<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&family=JetBrains+Mono:wght@500;700&family=Patrick+Hand&display=swap" rel="stylesheet"><style>${css}</style>`;

const ROWS = [['Passkey onboarding', ''], ['AUSD balance', ''], ['Send / receive', 'settled instantly']];
const ckHtml = (done, anim) => {   // done: [bool x3]; anim: {i, p} for the item being ticked
  const rows = ROWS.map(([t, sub], i) => {
    let sw = done[i] ? 1 : 0, tp = done[i] ? 1 : 0;
    if (anim && anim.i === i) { sw = Math.min(1, anim.p / 0.7); tp = Math.max(0, (anim.p - 0.3) / 0.7); }
    const tick = tp > 0 ? `<svg viewBox="0 0 46 46"><path d="M8 24 L18 36 L40 7" fill="none" stroke="#0a0a0a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100 * (1 - tp)).toFixed(1)}"/></svg>` : '';
    return `<div class="row"><div class="bx">${tick}</div><div class="tx"><span class="s" style="background-size:${(sw * 100).toFixed(0)}% 100%">${t}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  }).join('');
  return `<div class="ck"><div class="h">Agora bounty · show all three</div>${rows}</div>`;
};
const html = (it) => {
  if (it.type === 'title') return `<div class="title"><h1><span>Hisab</span> on Monad</h1><p>${it.text}</p></div>`;
  if (it.type === 'end') return `<div class="end"><div><h1><span>Hisab</span> on Monad</h1><div class="h">Built on Monad testnet · AUSD · Privy</div></div><div class="urls"><div class="u">hisab-monad.vercel.app</div><div class="u">github.com/vj-io/hisab-monad</div></div></div>`;
  if (it.type === 'note') return `<div class="lbl note"><div class="tab"></div><div class="t">${it.text}${it.sub ? `<small>${it.sub}</small>` : ''}</div></div>`;
  if (it.type === 'ck') return ckHtml(it.done, it.anim);
  return `<div class="lbl"><div class="tab"></div><div class="t">${it.text}${it.sub ? `<small>${it.sub}</small>` : ''}</div></div>`;
};
// checklist states: ck0..ck3 (n ticks done) and cks{i}_{k} (item i animating, step k of 10)
const ck = [];
for (let n = 0; n <= 3; n++) ck.push({ id: `ck${n}`, type: 'ck', done: [0, 1, 2].map((j) => j < n) });
for (let i = 0; i < 3; i++) for (let k = 1; k <= 10; k++) ck.push({ id: `cks${i}_${k}`, type: 'ck', done: [0, 1, 2].map((j) => j < i), anim: { i, p: k / 10 } });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1800, height: 400 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const sizes = {};
for (const it of [...items, ...ck]) {
  await p.setContent(head + `<body>${html(it)}</body>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(it.type === 'ck' ? 40 : 150);
  const el = p.locator('body > *').first();
  const bb = await el.boundingBox();
  const m = 14;
  await p.screenshot({ path: `ov/${it.id}.png`, omitBackground: true, clip: { x: bb.x - m, y: bb.y - m, width: bb.width + m * 2 + 8, height: bb.height + m * 2 + 8 } });
  sizes[it.id] = [Math.round(bb.width + m * 2 + 8), Math.round(bb.height + m * 2 + 8)];
}
fs.writeFileSync('ov/sizes.json', JSON.stringify(sizes));
console.log('ck0 visible', sizes.ck0[0] - 36, 'x', sizes.ck0[1] - 36, '| end', sizes.end, '| note', sizes.note, '| title', sizes.title);
await b.close();
