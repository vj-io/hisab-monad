// Renders the context doodle (ctx.html) to ctx/%05d.jpg at 30 fps. Usage: node ctx.mjs [N_FRAMES]   |   node ctx.mjs still t1 t2 ... (contact frames in ctx_still/)
import { chromium } from 'playwright';
import fs from 'node:fs';
const plan = fs.existsSync('plan.json') ? JSON.parse(fs.readFileSync('plan.json', 'utf8')) : { N_CTX: 294 };
const ev = JSON.parse(fs.readFileSync('raw/events.json', 'utf8'));
const ms = parseInt((ev.meta.payMs || '1892 ms')) || 1892;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
await p.goto(`file://${process.cwd()}/ctx.html?ms=${ms}`);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
if (process.argv[2] === 'still') {
  fs.mkdirSync('ctx_still', { recursive: true });
  for (const t of process.argv.slice(3).map(Number)) { await p.evaluate((t) => window.render(t), t); await p.screenshot({ path: `ctx_still/t${t.toFixed(2)}.png` }); }
} else {
  fs.mkdirSync('ctx', { recursive: true });
  const N = Number(process.argv[2]) || plan.N_CTX;
  for (let i = 1; i <= N; i++) {
    await p.evaluate((t) => window.render(t), (i - 1) / 30);
    await p.screenshot({ path: `ctx/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  console.log('wrote', N, 'frames, pay', ms, 'ms');
}
await b.close();
