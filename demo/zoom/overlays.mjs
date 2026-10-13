// Renders Doodle-style overlay sprites (transparent PNG, 2x) from labels.json -> ov/*.png (+ ov/sizes.json)
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
.lbl .t small{display:block;font-family:'Patrick Hand',cursive;font-weight:400;font-size:26px;letter-spacing:0;color:#444;margin-top:2px}
.chip{display:inline-flex;align-items:center;gap:10px;background:var(--paper);border:3px solid var(--ink);border-radius:999px;padding:8px 18px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:21px;box-shadow:4px 4px 0 var(--ink)}
.chip i{width:14px;height:14px;border-radius:50%;background:#16c60c;border:2px solid var(--ink);display:block}
.title{display:inline-block;background:var(--paper);border:4px solid var(--ink);border-radius:16px;padding:14px 32px;box-shadow:8px 8px 0 var(--ink)}
.title h1{font-weight:800;font-size:76px;letter-spacing:-3px;line-height:1}
.title h1 span{background:linear-gradient(transparent 58%,var(--lime) 58% 92%,transparent 92%);padding:0 8px}
.title p{font-family:'Patrick Hand',cursive;font-size:34px;margin-top:4px}
.end{display:inline-flex;flex-direction:column;gap:10px;background:var(--paper);border:5px solid var(--ink);border-radius:18px;padding:22px 44px;box-shadow:10px 10px 0 var(--ink)}
.end h1{font-weight:800;font-size:64px;letter-spacing:-2px;line-height:1}
.end h1 span{background:linear-gradient(transparent 58%,var(--lime) 58% 92%,transparent 92%);padding:0 8px}
.end .u{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:38px;background:#fff;border:4px solid var(--ink);border-radius:10px;padding:6px 18px;width:fit-content}
.end .h{font-family:'Patrick Hand',cursive;font-size:32px}
`;
const head = `<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;800&family=JetBrains+Mono:wght@500;700&family=Patrick+Hand&display=swap" rel="stylesheet"><style>${css}</style>`;
const html = (it) => {
  if (it.type === 'chip') return `<span class="chip"><i></i>${it.text}</span>`;
  if (it.type === 'title') return `<div class="title"><h1><span>Hisab</span> on Monad</h1><p>${it.text}</p></div>`;
  if (it.type === 'end') return `<div class="end"><h1><span>Hisab</span> on Monad</h1><div class="u">hisab-monad.vercel.app</div><div class="u">github.com/vj-io/hisab-monad</div><div class="h">Built on Monad testnet · AUSD · Privy</div></div>`;
  return `<div class="lbl"><div class="tab"></div><div class="t">${it.text}${it.sub ? `<small>${it.sub}</small>` : ''}</div></div>`;
};
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1800, height: 400 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const sizes = {};
for (const it of items) {
  await p.setContent(head + `<body>${html(it)}</body>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  const el = p.locator('body > *').first();
  const bb = await el.boundingBox();
  const m = 14;
  await p.screenshot({ path: `ov/${it.id}.png`, omitBackground: true, clip: { x: bb.x - m, y: bb.y - m, width: bb.width + m * 2 + 8, height: bb.height + m * 2 + 8 } });
  sizes[it.id] = [Math.round(bb.width + m * 2 + 8), Math.round(bb.height + m * 2 + 8)];
}
fs.writeFileSync('ov/sizes.json', JSON.stringify(sizes));
await b.close();
