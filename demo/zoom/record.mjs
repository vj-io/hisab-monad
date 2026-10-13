// Records the REAL Hisab on Monad console end to end at 4K via CDP screencast.
// Writes raw/*.jpg, raw/frames.json (frame timestamps), raw/events.json (beats, dead waits, focus rects, keys, mouse path).
// Usage: node record.mjs        (needs timings.json + narration.json from narrate.py; spends ~0.6 MON via the faucet)
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'https://hisab-monad.vercel.app';
const nar = JSON.parse(fs.readFileSync('narration.json', 'utf8'));
const tim = JSON.parse(fs.readFileSync('timings.json', 'utf8'));
const DUR = Object.fromEntries(nar.map((n, i) => [n.id, tim[i].dur]));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8')); // voice start offset (s) after beat start
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = () => Date.now() / 1000;
const LONG = 150_000;

if (fs.existsSync('raw/events.json')) fs.renameSync('raw', `raw_prev_${Date.now()}`);
fs.mkdirSync('raw', { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(LONG);
const cdp = await ctx.newCDPSession(page);

const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  const i = frames.length;
  frames.push(f.metadata.timestamp);
  fs.writeFile(`raw/${String(i).padStart(6, '0')}.jpg`, Buffer.from(f.data, 'base64'), () => {});
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});

const ev = []; const mouse = [];
const E = (k, d = {}) => { ev.push({ t: T(), k, ...d }); return ev.at(-1); };
const log = (...a) => console.log(`[${(T() - T0).toFixed(1)}s]`, ...a);
const T0 = T();

// ---------- geometry helpers ----------
const union = (rs) => {
  rs = rs.filter(Boolean);
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const rectOf = async (loc, up = 0) => {
  try {
    return await loc.first().evaluate((el, up) => { for (let i = 0; i < up && el.parentElement; i++) el = el.parentElement; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, sy: scrollY }; }, up, { timeout: 4000 });
  } catch { console.warn('rect miss'); return null; }
};
const U = async (locs) => union(await Promise.all(locs.map((l) => (Array.isArray(l) ? rectOf(l[0], l[1]) : rectOf(l)))));

// card (Panel) by title: h3 -> flex div -> px-4 div -> InkBox
const card = (title) => page.locator('h3', { hasText: title }).first().locator('xpath=../../..');
const text = (re, o) => page.getByText(re, o).first();
const btn = (name) => page.getByRole('button', { name, exact: true }).first();
const tab = btn;

// ---------- camera log ----------
async function focus(locs, o = {}) { // log the rect currently on screen (viewport px)
  const r = await U(locs);
  if (r) E('focus', { rect: r, pad: o.pad ?? 56, minW: o.minW ?? 760 });
  return r;
}
const wide = () => E('focus', { wide: true });
async function scrollFocus(locs, o = {}) { // scroll so the union is comfortably on screen, then log it at its final position
  const r = await U(locs);
  if (!r) return null;
  const sy = await page.evaluate(() => scrollY);
  const maxS = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const top = r.y, bot = r.y + r.h;
  let target = sy;
  if (top < 110 || bot > 1030) target = Math.max(0, Math.min(maxS, Math.round(sy + (top + bot) / 2 - 560)));
  const fr = { ...r, y: r.y + sy - target };
  if (o.log !== false) E('focus', { rect: fr, pad: o.pad ?? 56, minW: o.minW ?? 760 });
  if (target !== sy) { await page.evaluate((t) => scrollTo({ top: t, behavior: 'smooth' }), target); await sleep(750); }
  return fr;
}
const label = (txt, secs = 3, o = {}) => E('label', { text: txt, secs, pos: o.pos ?? 'bl', sub: o.sub });
const hl = async (locs, secs = 2.2) => { const r = await U(locs); if (r) E('hl', { rect: r, secs }); };
const key = async (name, locs, extra = {}) => { const r = locs ? await U(locs) : null; E('key', { name, rect: r, ...extra }); };

// ---------- mouse ----------
let mx = 960, my = 700;
const ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - ((-2 * u + 2) ** 3) / 2);
async function moveTo(x, y, dur = 0.5) { // virtual cursor: planned path is logged, one real move at the end (renderer is slow under 4K screencast)
  const sx = mx, sy = my, n = Math.max(8, Math.round(dur * 60));
  const nx = -(y - sy), ny = x - sx, nl = Math.hypot(nx, ny) || 1, bow = Math.min(40, nl * 0.06);
  const t0 = T();
  for (let i = 1; i <= n; i++) {
    const u = ease(i / n), arc = Math.sin(Math.PI * u) * bow;
    mouse.push([t0 + (dur * i) / n, sx + (x - sx) * u + (nx / nl) * arc, sy + (y - sy) * u + (ny / nl) * arc]);
  }
  mx = x; my = y;
  await sleep(dur * 1000);
  await page.mouse.move(x, y);
}
async function click(loc, o = {}) {
  loc = loc.first();
  const tt = T();
  await loc.waitFor();
  while (!(await loc.isEnabled())) await sleep(60);
  const t1 = T();
  const ctxLocs = [loc, ...(o.ctx ?? [])];
  if (o.tabs) { if (o.log !== false) E('focus', { rect: { x: 430, y: 0, w: 1060, h: 360 }, pad: 0, minW: 1060 }); }
  else await scrollFocus(ctxLocs, o);
  const t2 = T();
  const b = await loc.boundingBox();
  if (process.env.DBG) console.log('click timings', (t1 - tt).toFixed(2), (t2 - t1).toFixed(2));
  await moveTo(b.x + b.width * (0.45 + Math.random() * 0.1), b.y + b.height * (0.45 + Math.random() * 0.1), o.dur ?? 0.55);
  await sleep(o.pre ?? 150);
  await page.mouse.down();
  E('click', { x: mx, y: my });
  await sleep(90); await page.mouse.up();
}
async function hover(loc, dur = 0.5) {
  const b = await loc.first().boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, dur);
}

// ---------- beats ----------
const cdead = (D) => (D < 1.3 ? D : Math.max(D / 6, Math.min(D, 0.9 + 0.1 * D)));
let B = null;
async function dead(fn, lead = 350) {
  await sleep(lead);
  const s = T();
  E('dead', { on: true });
  await fn();
  const e = T();
  E('dead', { on: false });
  B.deadReal += e - s; B.deadComp += cdead(e - s);
}
const hold = async (sec) => { E('hold', { on: true }); await sleep(sec * 1000); E('hold', { on: false }); };
async function beat(id, fn) {
  const s = T();
  B = { id, s, deadReal: 0, deadComp: 0 };
  E('beat', { id, dur: DUR[id], off: OFF[id] ?? 0.15 });
  log('beat', id);
  await fn();
  const spent = T() - s - B.deadReal + B.deadComp;
  const need = (OFF[id] ?? 0.15) + DUR[id] + 0.35 - spent;
  if (need > 0.05) await hold(need);
  E('beatEnd', { id });
}
const meta = {};

// ---------- go ----------
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await text(/Lender \/ Pool/).waitFor();
await text(/how it works|Exporter/i).waitFor();
await text('Total assets').waitFor();
await page.evaluate(() => scrollTo(0, 0));
await sleep(1500);
E('start');
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
await sleep(600);
mouse.push([T(), mx, my]);


try {
const shareBox = () => text('Share price').locator('xpath=..');
const shareVal = async () => (await shareBox().innerText().catch(() => '')).replace(/\n/g, ' ').replace(/Share price\s*/, '');
const roleName = (r) => page.locator('span.capitalize', { hasText: new RegExp(`^${r}$`) });
const emailBtn = (n) => page.getByRole('button', { name: 'Use email wallet' }).nth(n);
const goTab = async (name, ready) => {
  await click(tab(name), { tabs: true, dur: 0.45, pre: 100 });
  await dead(async () => { await ready(); }, 0);
  await sleep(200);
};

await beat('console', async () => {
  wide();
  await moveTo(1100, 400, 0.8);
  await focus([text('ships, gets advance'), text('pays at due date'), text('exporter balance')], { pad: 70 });
  label('Exporter → Pool → Buyer', 4, { pos: 'bl' });
  await hold(5.2);
  await focus([roleName('lender'), emailBtn(2)], { pad: 50 });
  label('3 roles · 3 wallets · live', 4);
  await hover(roleName('lender'), 0.7);
  await hover(roleName('exporter'), 0.7);
  await hover(roleName('buyer'), 0.7);
});

await beat('wallets', async () => {
  const email = emailBtn(0);
  const brow = page.getByRole('button', { name: 'Connect browser wallet' }).first();
  await focus([brow, email], { pad: 90 });
  await hover(brow, 0.6);
  await click(email, { ctx: [brow], dur: 0.45 });
  await dead(async () => { await page.locator('#privy-modal-content').waitFor({ timeout: 30000 }); });
  await sleep(400);
  await key('privy', [page.locator('#privy-modal-content')]);
  await focus([page.locator('#privy-modal-content')], { pad: 40, minW: 800 });
  label('Email login · Privy', 3.2, { pos: 'bl' });
  await hold(2.0);
  const close = page.locator('#privy-modal-content button[aria-label="close modal"]').first();
  if (await close.count()) await click(close, { log: false, dur: 0.45 }); else await page.keyboard.press('Escape');
  await page.locator('#privy-modal-content').waitFor({ state: 'detached', timeout: 10000 });
  wide();
});

await beat('load', async () => {
  await goTab('Exporter', () => text('Load demo invoice').waitFor());
  await focus([btn('Load demo invoice'), card('Credit tier')], { pad: 50 });
  label('Fresh wallet · Tier 0 · 70%', 2.4, { pos: 'bl' });
  await sleep(250);
  await click(btn('Load demo invoice'), { ctx: [card('Credit tier')], log: false, dur: 0.5 });
  await dead(async () => { await text(/^Seeded 0x/).waitFor(); await text('SB 6674321').waitFor(); await text(/39,000/).waitFor(); });
  await sleep(400);
  await key('seeded', [card('Invoice'), card('Credit tier')]);
  await focus([card('Invoice'), card('Credit tier')], { pad: 36 });
  label('SB 6674321 registered on-chain', 3.2, { pos: 'bl' });
  await hold(2.0);
});

await beat('tier', async () => {
  await focus([card('Credit tier')], { pad: 30 });
  await hl([card('Credit tier').getByText('80%').first()], 2.6);
  label('Tier 1 → 80% advance @ 12.5%', 3.4, { pos: 'bl' });
  await moveTo(1180, 640, 0.8);
  await hold(3.2);
  const offerLocs = () => [text('Advance offer'), text(/^39,000(\.\d+)?$/), text(/of .* at .*APR/)];
  await scrollFocus(offerLocs(), { pad: 60 });
  await key('offer', offerLocs());
  await hl([text(/^39,000(\.\d+)?$/)], 2.4);
  label('Offer: 39,000 AUSD', 3.2, { pos: 'bl' });
  meta.offer = (await text('Advance offer').locator('xpath=../..').innerText().catch(() => '')).replace(/\n/g, ' | ');
  log('offer', meta.offer);
});

await beat('lender', async () => {
  await goTab('Lender / Pool', () => text('Share price').waitFor());
  meta.shareBefore = await shareVal();
  log('share before', meta.shareBefore);
  const link = () => page.locator('a[href*="/tx/"]').first();
  await focus([btn('Mint test AUSD'), btn('Deposit'), page.getByText('Amount (AUSD)').first()], { pad: 70 });
  await click(btn('Mint test AUSD'), { ctx: [btn('Deposit')], log: false, dur: 0.45 });
  await dead(async () => { await link().waitFor(); });
  const first = await link().getAttribute('href');
  await sleep(200);
  await click(btn('Deposit'), { ctx: [btn('Mint test AUSD')], log: false, dur: 0.4 });
  await dead(async () => { await page.waitForFunction((h) => { const a = document.querySelector('a[href*="/tx/"]'); return a && a.getAttribute('href') !== h; }, first); await sleep(2200); });
  await key('deposit', [text('Your position').locator('xpath=..'), text('Your shares').locator('xpath=..')]);
  await scrollFocus([text('Total assets').locator('xpath=..'), text('Your position').locator('xpath=..'), text('Your shares').locator('xpath=..')], { pad: 40 });
  label('Deposit 100,000 → shares minted', 3.2, { pos: 'bl' });
  await hold(1.2);
});

await beat('ack', async () => {
  await goTab('Buyer', () => text('1. Acknowledge').waitFor());
  await focus([card('1. Acknowledge')], { pad: 50 });
  label('Buyer signs · EIP-712', 3.0, { pos: 'bl' });
  await click(btn('Acknowledge'), { ctx: [card('1. Acknowledge')], log: false, dur: 0.5 });
  await dead(async () => { await text(/Acknowledged at block/).waitFor(); });
  await sleep(300);
  await key('acked', [text(/Acknowledged at block/), card('1. Acknowledge')]);
  await focus([card('1. Acknowledge')], { pad: 40 });
});

await beat('accept', async () => {
  await goTab('Exporter', () => text('Accept offer').waitFor());
  await scrollFocus([text('Advance offer'), btn('Accept offer'), btn('Finance again')], { pad: 70 });
  await click(btn('Accept offer'), { ctx: [text('Advance offer')], log: false, dur: 0.5 });
  await dead(async () => { await text(/confirmed in \d+ ms/).waitFor(); }, 200);
  meta.acceptMs = (await text(/confirmed in \d+ ms/).innerText()).match(/\d+ ms/)?.[0];
  log('accept ms', meta.acceptMs);
  await sleep(150);
  await scrollFocus([text(/Advance sent:/), text('Financed advance'), text(/at .* APR\./)], { pad: 70 });
  await key('accept', [text(/Advance sent:/)]);
  label(`Advance sent · confirmed in ${meta.acceptMs}`, 3.6, { pos: 'bl' });
  await hold(2.0);
  await hl([text(/confirmed in \d+ ms/)], 2.6);
  await focus([text(/Advance sent:/)], { pad: 120, minW: 760 });
  await hold(1.8);
  await focus([card('Invoice')], { pad: 36 });
  label('FINANCED · locked to the pool', 2.6, { pos: 'bl' });
  await hold(1.6);
});

await beat('again', async () => {
  await scrollFocus([btn('Accept offer'), btn('Finance again'), text('Financed advance')], { pad: 70 });
  await click(btn('Finance again'), { ctx: [text(/Advance sent:/)], log: false, dur: 0.5 });
  await dead(async () => { await page.locator('[role="alert"]').first().waitFor(); }, 200);
  await sleep(150);
  meta.again = await page.locator('[role="alert"]').first().innerText();
  log('again', meta.again);
  await scrollFocus([page.locator('[role="alert"]').first(), btn('Finance again')], { pad: 80 });
  await key('locked', [page.locator('[role="alert"]').first()]);
  label('Double-financing blocked', 3.0, { pos: 'bl' });
  await hold(1.5);
});

await beat('pay', async () => {
  await goTab('Buyer', () => text('2. Pay').waitFor());
  const wf = () => page.locator('div.grid-cols-3').first().locator('xpath=..');
  await scrollFocus([card('2. Pay')], { pad: 30, minW: 900 });
  label('One tx · 3 legs', 3.2, { pos: 'bl' });
  await sleep(300);
  await click(btn('Pay'), { ctx: [wf()], log: false, dur: 0.5 });
  await dead(async () => { await page.locator('.d-stamp-lg').first().waitFor(); await text(/confirmed in \d+ ms/).waitFor(); }, 200);
  meta.payMs = (await text(/confirmed in \d+ ms/).innerText()).match(/\d+ ms/)?.[0];
  log('pay ms', meta.payMs);
  await sleep(150);
  const rw = () => page.locator('div.grid-cols-3').last().locator('xpath=..');
  const leg = (i) => page.locator('div.grid-cols-3').last().locator('> div').nth(i);
  await scrollFocus([page.locator('.d-stamp-lg').first(), rw(), text(/confirmed in \d+ ms/)], { pad: 40 });
  await key('paid', [page.locator('.d-stamp-lg').first(), rw()]);
  await hold(1.0);
  meta.legs = await page.locator('div.grid-cols-3').last().innerText();
  log('legs', meta.legs.replace(/\n/g, ' '));
  await focus([leg(0)], { pad: 80, minW: 760 }); await hl([leg(0)], 2.2); label('Pool: principal + interest', 2.8, { pos: 'bl' });
  await hold(2.8);
  await focus([leg(1)], { pad: 80, minW: 760 }); await hl([leg(1)], 1.5); label('Platform fee', 1.7, { pos: 'bl' });
  await hold(1.6);
  await focus([leg(2)], { pad: 80, minW: 760 }); await hl([leg(2)], 2.2); label('Exporter keeps the rest', 2.8, { pos: 'bl' });
  await hold(2.2);
});

await beat('tier2', async () => {
  await goTab('Exporter', () => text('88%').waitFor());
  await scrollFocus([card('Credit tier'), card('Invoice')], { pad: 30 });
  await key('tier2', [card('Credit tier')]);
  await hl([card('Credit tier').getByText('88%').first()], 2.4);
  label('Tier 2 → 88% @ 11.5%', 3.2, { pos: 'bl' });
  await hold(2.8);
  await scrollFocus([card('Payout history')], { pad: 36 });
  label('Payout history · on-chain', 2.0, { pos: 'bl' });
  await hold(1.5);
  await click(btn('Register next invoice'), { ctx: [], dur: 0.5 });
  await dead(async () => { await text(/42,900/).waitFor(); }, 200);
  await sleep(300);
  const o = () => [text('Advance offer'), text(/^42,900(\.\d+)?$/), text(/of .* at .*APR/)];
  await scrollFocus(o(), { pad: 60 });
  await key('offer2', o());
  await hl([text(/^42,900(\.\d+)?$/)], 2.4);
  label('Next offer: 42,900 AUSD', 3.0, { pos: 'bl' });
  meta.offer2 = (await text('Advance offer').locator('xpath=../..').innerText().catch(() => '')).replace(/\n/g, ' | ');
  log('offer2', meta.offer2);
});

await beat('share', async () => {
  await goTab('Lender / Pool', () => text('Share price').waitFor());
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(600);
  meta.shareAfter = await shareVal();
  log('share after', meta.shareAfter);
  await scrollFocus([text('Total assets').locator('xpath=..'), shareBox(), text('Your position').locator('xpath=..')], { pad: 36 });
  await key('share', [shareBox()]);
  await hl([page.locator('div[title]').first()], 3);
  label(`Share price ↑ ${meta.shareBefore.replace(/ ?AUSD/, '')} → ${meta.shareAfter.replace(/ ?AUSD/, '')}`, 4.2, { pos: 'bl' });
  await hold(2.5);
});

await beat('explorer', async () => {
  await goTab('Explorer', () => page.locator('li a[href*="/tx/"]').nth(2).waitFor());
  await sleep(500);
  const ol = page.locator('ol').filter({ has: page.locator('a[href*="/tx/"]').nth(3) }).first();
  const olc = (await ol.count()) ? ol : page.locator('ol').last();
  await scrollFocus([olc.locator('xpath=../..')], { pad: 20 });
  await key('timeline', [olc]);
  label('Registered → Acknowledged → Financed → Paid', 4.6, { pos: 'bl' });
  const links = olc.locator('a[href*="/tx/"]');
  const nlinks = await links.count();
  for (let i = 0; i < nlinks; i++) { await hover(links.nth(i), 0.5); await hold(0.4); }
});

await beat('edge', async () => {
  await goTab('Exporter', () => text('Realised / on time / short').waitFor());
  const rows = () => [text('Realised / on time / short'), text('Defaults')];
  await scrollFocus(rows(), { pad: 60 });
  await hl([text('Realised / on time / short').locator('xpath=..')], 2.4);
  label('Short pay → PARTIAL · Default → Tier 0', 4.0, { pos: 'bl' });
  await hold(3.4);
  await scrollFocus([page.locator('nav').first()], { pad: 100 });
  await hover(tab('Legacy (SWIFT)'), 0.8);
  label('28 contract tests · SWIFT path kept', 3.4, { pos: 'bl' });
  await hold(2.2);
});

await beat('why', async () => {
  await goTab('Lender / Pool', () => text('REALISED').waitFor());
  const fi = () => card('Funded invoices');
  await scrollFocus([fi()], { pad: 50 });
  await key('why', [fi()]);
  await hl([text(/at 12\.50%/)], 2.4);
  label(`Each tx ~${(parseInt(meta.payMs) / 1000).toFixed(1)} s on Monad`, 3.2, { pos: 'bl' });
  await hold(3.4);
  await scrollFocus([roleName('exporter'), emailBtn(2)], { pad: 60 });
  await hl([page.getByText(/47,7\d\d\.\d\d/).first()], 2.6);
  label('One asset: AUSD (mock on testnet)', 3.4, { pos: 'bl' });
  await hold(2.4);
});

await beat('end', async () => {
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await moveTo(1700, 900, 0.8);
  wide();
  E('endcard');
  await hold(4.5);
});
} catch (e) { console.error('FAILED', e); await page.screenshot({ path: 'raw/fail.png' }).catch(() => {}); }
await sleep(800);
E('stop');
await cdp.send('Page.stopScreencast');
await sleep(500);
fs.writeFileSync('raw/frames.json', JSON.stringify(frames));
fs.writeFileSync('raw/events.json', JSON.stringify({ ev, mouse, meta }, null, 0));
log('frames', frames.length, 'meta', JSON.stringify(meta));
await ctx.close(); await browser.close();
