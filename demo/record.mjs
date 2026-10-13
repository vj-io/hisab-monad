// Records the live Hisab on Monad console end to end. Usage: node record.mjs
// Needs timings.json (from narrate.py on narration.json). Writes raw/*.webm and beats.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { introCard, endCard } from './cards.mjs';

const URL = 'https://hisab-monad.vercel.app';
const nar = JSON.parse(fs.readFileSync('narration.json', 'utf8'));
const tim = JSON.parse(fs.readFileSync('timings.json', 'utf8'));
const dur = Object.fromEntries(nar.map((n, i) => [n.id, tim[i].dur]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LONG = 150_000;

fs.rmSync('raw', { recursive: true, force: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: 'raw', size: { width: 1920, height: 1080 } } });
await ctx.addInitScript(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const s = document.createElement('style');
    s.textContent = '@keyframes __rip{from{transform:translate(-50%,-50%) scale(.3);opacity:.9}to{transform:translate(-50%,-50%) scale(2.6);opacity:0}}';
    const d = document.createElement('div');
    d.id = '__cur';
    d.style.cssText = 'position:fixed;left:-60px;top:-60px;width:22px;height:22px;border-radius:50%;background:#0a0a0a;border:3px solid #fff;box-shadow:0 0 0 1.5px #0a0a0a;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';
    document.documentElement.append(s, d);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:60px;height:60px;border-radius:50%;background:#c8ff00;border:3px solid #0a0a0a;z-index:2147483646;pointer-events:none;animation:__rip .6s ease-out forwards`;
      document.documentElement.append(r); setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
page.setDefaultTimeout(LONG);
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const log = (...a) => console.log(`[${now().toFixed(1)}s]`, ...a);

let mx = 960, my = 540;
async function moveTo(x, y, steps = 28) { await page.mouse.move(x, y, { steps }); mx = x; my = y; }
async function show(loc) {
  const b = await loc.boundingBox();
  if (b && b.y > 150 && b.y + b.height < 960) return; // already comfortably in view
  await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await sleep(800);
}
async function point(loc) {
  const b = await loc.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  return b;
}
async function click(loc) {
  loc = loc.first();
  await loc.waitFor();
  await loc.click({ trial: true }); // waits until enabled and stable
  await show(loc);
  await point(loc);
  await sleep(250);
  await page.mouse.down(); await sleep(80); await page.mouse.up();
}
const tab = (name) => page.getByRole('button', { name, exact: true });
const btn = (name) => page.getByRole('button', { name, exact: true });
const text = (re) => page.getByText(re).first();

const beats = [];
async function beat(id, fn) {
  const start = now();
  beats.push({ id, start });
  log('beat', id);
  try { await fn(); } catch (e) {
    await page.screenshot({ path: `fail-${id}.png` }).catch(() => {});
    console.error(`BEAT FAILED: ${id}: ${e.message}`);
    await ctx.close(); await browser.close();
    process.exit(1);
  }
  const need = start + 0.3 + dur[id] + 0.15 - now();
  if (need > 0) await sleep(need * 1000);
  beats.at(-1).end = now();
}

// ---- beats ----
await page.setContent(introCard, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await sleep(300);
await beat('intro', async () => {
  // warm the app's assets in a throwaway page (same context, so same burner keys)
  const w = await ctx.newPage();
  await w.goto(URL, { waitUntil: 'networkidle' }).catch(() => {});
  await w.close();
});

await beat('console', async () => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await text(/Lender \/ Pool/).waitFor();
  await text(/how it works|Exporter/i).waitFor();
  await sleep(600);
  for (const r of ['lender', 'exporter', 'buyer']) {
    const b = await page.locator('span.capitalize', { hasText: new RegExp(`^${r}$`) }).first().boundingBox();
    await moveTo(b.x + 60, b.y + 40); await sleep(350);
  }
  await moveTo(960, 330); // how-it-works strip
});

await beat('wallets', async () => {
  const email = btn('Use email wallet').first();
  const brow = btn('Connect browser wallet').first();
  await point(brow); await sleep(900);
  await click(email);
  await page.locator('#privy-modal-content').waitFor({ timeout: 30000 });
  await sleep(1800);
  const close = page.locator('#privy-modal-content button[aria-label="close modal"]').first();
  if (await close.count()) await click(close); else await page.keyboard.press('Escape');
  await page.locator('#privy-modal-content').waitFor({ state: 'detached', timeout: 10000 });
});

await beat('load', async () => {
  await click(tab('Exporter'));
  await click(btn('Load demo invoice'));
  await text(/^Seeded 0x/).waitFor();
  await text('SB 6674321').waitFor();
  await text(/39,000/).waitFor();
});

await beat('tier', async () => {
  await show(text('Credit tier'));
  await moveTo(560, 480); await sleep(1500);
  await show(text(/Advance offer/));
  await moveTo(900, 560);
  log('offer text:', (await text(/Advance offer/).locator('xpath=..').innerText()).replace(/\n/g, ' | '));
});

const shareText = async () => (await text('Share price').locator('xpath=..').innerText().catch(() => '')).replace(/\n/g, ' ');
await beat('lender', async () => {
  await click(tab('Lender / Pool'));
  await text(/Share price/).waitFor();
  log('share price before:', await shareText());
  const link = () => page.locator('a[href*="/tx/"]').first();
  await click(btn('Mint test AUSD'));
  await link().waitFor();
  const first = await link().getAttribute('href');
  await sleep(600);
  await click(btn('Deposit'));
  await page.waitForFunction((h) => { const a = document.querySelector('a[href*="/tx/"]'); return a && a.getAttribute('href') !== h; }, first);
  await sleep(2500); // let pool figures refresh
  await moveTo(960, 200);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  log('share price after deposit:', await shareText());
});

await beat('ack', async () => {
  await click(tab('Buyer'));
  await text('1. Acknowledge').waitFor();
  await click(btn('Acknowledge'));
  await text(/Acknowledged at block/).waitFor();
  await sleep(500);
});

await beat('accept', async () => {
  await click(tab('Exporter'));
  await click(btn('Accept offer'));
  await text(/confirmed in \d+ ms/).waitFor();
  await show(text(/Advance sent:/));
  log('accept:', await text(/Advance sent:/).innerText());
});

await beat('again', async () => {
  await click(btn('Finance again'));
  await page.locator('[role="alert"]').first().waitFor();
  await show(page.locator('[role="alert"]').first());
  log('again:', await page.locator('[role="alert"]').first().innerText());
});

await beat('pay', async () => {
  await click(tab('Buyer'));
  await text('2. Pay').waitFor();
  await show(text(/buyer pays/));
  await sleep(1500);
  await click(btn('Pay'));
  await text(/confirmed in \d+ ms/).waitFor();
  await show(text(/to exporter/));
  await sleep(600);
  log('paid:', (await page.locator('main, body').first().innerText()).match(/to pool[\s\S]{0,120}/)?.[0].replace(/\n/g, ' '));
});

await beat('tier2', async () => {
  await click(tab('Exporter'));
  await text('88%').waitFor();
  await show(text('Credit tier'));
  await sleep(1500);
  await show(text('Payout history'));
  await sleep(1200);
  await click(btn('Register next invoice'));
  await text(/42,900/).waitFor();
  await show(text(/Advance offer/));
  log('next offer:', (await text(/Advance offer/).locator('xpath=..').innerText()).replace(/\n/g, ' | '));
});

await beat('share', async () => {
  await click(tab('Lender / Pool'));
  await text(/Share price/).waitFor();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(1000);
  await moveTo(900, 420);
  log('share price after repay:', await shareText());
});

await beat('explorer', async () => {
  await click(tab('Explorer'));
  await page.locator('li a[href*="/tx/"]').nth(2).waitFor();
  const paidLink = page.locator('li').filter({ has: page.locator('a[href*="/tx/"]') }).filter({ hasText: /Paid/ }).first().locator('a[href*="/tx/"]');
  await paidLink.waitFor();
  await show(paidLink);
  await point(paidLink); // the link opens the tx on the Monad explorer (Cloudflare-gated for automation, so not followed)
  log('pay tx:', await paidLink.getAttribute('href'));
});

await beat('edge', async () => {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await moveTo(1000, 330);
});

await beat('why', async () => {
  await page.evaluate(() => scrollTo({ top: 700, behavior: 'smooth' }));
  await sleep(2500);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
});

await page.setContent(endCard, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await beat('end', async () => {});
await sleep(1200);
const endAt = now();

fs.writeFileSync('beats.json', JSON.stringify({ beats, endAt }, null, 1));
const v = page.video();
fs.writeFileSync('video-path.txt', await v.path().catch(() => ''));
await ctx.close();
await browser.close();
log('video:', await v.path());
