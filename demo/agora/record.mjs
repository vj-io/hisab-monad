// Records the REAL Hisab on Monad console for the Agora demo (fresh run of https://hisab-monad.vercel.app, Monad testnet).
// Viewport 1920x1500 so the page never scrolls: the virtual camera in compose.py does all the moving.
// Writes $RAW/*.jpg (default raw/), frames.json (frame timestamps) and events.json (beats, dead waits, focus rects, keys, mouse path).
// Usage: node record.mjs          full run (needs timings.json + narration.json + offsets.json; spends ~0.6 MON via the faucet)
//        ONLY=pk RAW=raw_test node record.mjs   only the passkey-preview beat (no faucet, no transactions)
// SAFETY: this script never logs in, never types an email and never clicks "Sign up with passkey" (clicking would start a real
// passkey sign-up). It only hovers that button, opens the Privy window, shows "I have a passkey" and closes the window again.
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'https://hisab-monad.vercel.app';
const RAW = process.env.RAW || 'raw';
const ONLY = process.env.ONLY || '';
const VH = 1500, SLOT_S = 20.0;
const nar = JSON.parse(fs.readFileSync('narration.json', 'utf8'));
const tim = JSON.parse(fs.readFileSync('timings.json', 'utf8'));
const DUR = Object.fromEntries(nar.map((n, i) => [n.id, tim[i].dur]));
const OFF = JSON.parse(fs.readFileSync('offsets.json', 'utf8')); // voice start offset (s) after beat start
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = () => Date.now() / 1000;
const LONG = 150_000;

if (fs.existsSync(`${RAW}/events.json`)) fs.renameSync(RAW, `${RAW}_prev_${Date.now()}`);
fs.mkdirSync(RAW, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: VH }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(LONG);
const cdp = await ctx.newCDPSession(page);

const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  const i = frames.length;
  frames.push(f.metadata.timestamp);
  fs.writeFile(`${RAW}/${String(i).padStart(6, '0')}.jpg`, Buffer.from(f.data, 'base64'), () => {});
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});

const ev = []; const mouse = [];
const E = (k, d = {}, t = T()) => { ev.push({ t, k, ...d }); return ev.at(-1); };
const T0 = T();
const log = (...a) => console.log(`[${(T() - T0).toFixed(1)}s]`, ...a);

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
// role cards (wallet bar): name span -> flex div -> d-box-body -> d-box
const roleName = (r) => page.locator('span.capitalize', { hasText: new RegExp(`^${r}$`) });
const rcard = (r) => roleName(r).first().locator('xpath=../../..');
const balSpan = (r) => rcard(r).locator('div.font-mono > span').nth(1);   // "0.00 AUSD"
const ROLEIDX = { lender: 0, exporter: 1, buyer: 2 };
const signup = (r) => page.getByRole('button', { name: 'Sign up with passkey' }).nth(ROLEIDX[r]);
const loginBtn = (r) => page.getByRole('button', { name: 'Passkey / email login' }).nth(ROLEIDX[r]);
const balText = async (r) => (await balSpan(r).innerText().catch(() => '')).replace(/\s*AUSD\s*$/, '');
const waitBal = async (r, re, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (re.test(await balText(r))) return true; await sleep(120); }
  console.warn('WARN balance did not match', r, re, await balText(r)); return false;
};
const totalAssets = async () => (await text('Total assets').locator('xpath=..').innerText().catch(() => '')).replace(/\n/g, ' ').replace(/Total assets\s*/, '').replace(/ ?AUSD/, '');

// ---------- camera log ----------
async function focus(locs, o = {}) { // log the rect currently on screen (viewport px); o.at = explicit time (retroactive keyframe)
  const r = await U(locs);
  if (r) E('focus', { rect: r, pad: o.pad ?? 56, minW: o.minW ?? 760 }, o.at ?? T());
  return r;
}
const wide = () => E('focus', { wide: true });
const label = (txt, secs = 3, o = {}) => E('label', { text: txt, secs, pos: o.pos ?? 'bl', sub: o.sub });
const hl = async (locs, secs = 2.2, at) => { const r = await U(locs); if (r) E('hl', { rect: r, secs }, at ?? T()); };
const key = async (name, locs, extra = {}, at) => { const r = locs ? await U(locs) : null; E('key', { name, rect: r, ...extra }, at ?? T()); };

// ---------- mouse ----------
let mx = 960, my = 700;
const ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - ((-2 * u + 2) ** 3) / 2);
async function moveTo(x, y, dur = 0.5) { // virtual cursor: planned path is logged, one real move at the end (renderer is slow under screencast)
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
  await loc.waitFor();
  const lt = (await loc.innerText().catch(() => '')) || '';
  if (/Sign up with passkey|I have a passkey|Continue with Email/i.test(lt)) throw new Error(`refusing to click "${lt}" (would start a real sign-up / login)`);
  while (!(await loc.isEnabled())) await sleep(60);
  if (o.tabs) { if (o.log !== false) E('focus', { rect: { x: 430, y: 0, w: 1060, h: 360 }, pad: 0, minW: 1060 }); }
  else if (o.log !== false) await focus([loc, ...(o.ctx ?? [])], o);
  const b = await loc.boundingBox();
  await moveTo(b.x + b.width * (0.45 + Math.random() * 0.1), b.y + b.height * (0.45 + Math.random() * 0.1), o.dur ?? 0.55);
  await sleep(o.pre ?? 150);
  await page.mouse.down();
  E('click', { x: mx, y: my });
  await sleep(90); await page.mouse.up();
}
async function hover(loc, dur = 0.5) { // move only: never clicks
  const b = await loc.first().boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2, dur);
}

// ---------- beats ----------
const cdead = (D) => (D < 1.3 ? D : Math.max(D / 6, Math.min(D, 0.9 + 0.1 * D)));
let B = null;
async function dead(fn, lead = 350) { // a wait compose.py may compress; resolves to the end time (when the result is on screen)
  await sleep(lead);
  const s = T();
  E('dead', { on: true });
  try { await fn(); } finally { E('dead', { on: false }); }
  const e = T();
  B.deadReal += e - s; B.deadComp += cdead(e - s);
  return e;
}
const hold = async (sec) => { E('hold', { on: true }); try { await sleep(sec * 1000); } finally { E('hold', { on: false }); } };
async function beat(id, fn, minDur = 0) {
  const s = T();
  B = { id, s, deadReal: 0, deadComp: 0 };
  E('beat', { id, dur: DUR[id], off: OFF[id] ?? 0.15 });
  log('beat', id);
  try { await fn(); } catch (e) { console.error('BEAT FAILED', id, e.message); await page.screenshot({ path: `${RAW}/fail_${id}.png` }).catch(() => {}); }
  const spent = T() - s - B.deadReal + B.deadComp;
  const need = Math.max((OFF[id] ?? 0.15) + DUR[id] + 0.35, minDur) - spent;
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
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 3000, everyNthFrame: 1 });
await sleep(600);
mouse.push([T(), mx, my]);

try {
const goTab = async (name, ready) => {
  await click(tab(name), { tabs: true, dur: 0.45, pre: 100 });
  await dead(async () => { await ready(); }, 0);
  await sleep(650);   // let cards finish their spring-in before any rect is measured
};

// ---- passkey slot (preview footage; the final video swaps in the user's own clip) ----
await beat('pk', async () => {
  wide();
  await moveTo(1100, 470, 0.8);
  await focus([roleName('lender'), loginBtn('buyer')], { pad: 50 });
  await hold(1.6);
  await focus([rcard('buyer')], { pad: 60 });
  await hover(signup('buyer'), 0.9);                 // hover only
  await hl([signup('buyer')], 2.8);
  await key('signup', null);
  await hold(2.6);
  await click(loginBtn('buyer'), { ctx: [], dur: 0.6, log: false });   // the other button: opens the Privy window, no login
  await dead(async () => { await page.locator('#privy-modal-content').waitFor({ timeout: 30000 }); }, 250);
  await sleep(500);
  await key('privy', [page.locator('#privy-modal-content')]);
  await focus([page.locator('#privy-modal-content')], { pad: 40, minW: 800 });
  await hold(1.8);
  const iHave = page.locator('#privy-modal-content').getByRole('button', { name: 'I have a passkey' });
  await hover(iHave, 0.8);                           // hover only
  await hl([iHave], 2.4);
  await hold(2.4);
  const close = page.locator('#privy-modal-content button[aria-label="close modal"]').first();
  if (await close.count()) await click(close, { log: false, dur: 0.5 }); else await page.keyboard.press('Escape');
  await page.locator('#privy-modal-content').waitFor({ state: 'detached', timeout: 10000 });
  wide();
  await focus([rcard('buyer')], { pad: 60 });
  await hover(rcard('buyer').locator('span.font-mono, button').first(), 0.7);
  await hold(1.0);
  await hover(signup('buyer'), 0.6);
}, SLOT_S);

if (!ONLY) {
await beat('load', async () => {
  await goTab('Exporter', () => text('Load demo invoice').waitFor());
  await focus([btn('Load demo invoice'), card('Credit tier')], { pad: 50 });
  label('Burner wallets · same flow', 3.0, { pos: 'bl' });
  await sleep(250);
  await click(btn('Load demo invoice'), { ctx: [card('Credit tier')], log: false, dur: 0.5 });
  await dead(async () => { await text(/^Seeded 0x/).waitFor(); await text('SB 6674321').waitFor(); await text(/39,000/).waitFor(); });
  await sleep(400);
  await key('seeded', null);
  await focus([card('Invoice'), card('Credit tier')], { pad: 36 });
  await hold(1.4);
  const offerLocs = () => [text('Advance offer'), text(/^39,000(\.\d+)?$/), text(/of .* at .*APR/)];
  await focus(offerLocs(), { pad: 60 });
  await key('offer', offerLocs());
  await hl([text(/^39,000(\.\d+)?$/)], 2.4);
  label('Offer: 39,000 AUSD', 3.2, { pos: 'bl' });
});

await beat('lender', async () => {
  await goTab('Lender / Pool', () => text('Share price').waitFor());
  meta.poolBefore = await totalAssets();
  meta.lenderBefore = await balText('lender');
  await focus([roleName('lender'), loginBtn('buyer')], { pad: 50 });
  label('AUSD balance on every role card', 3.2, { pos: 'bl' });
  await moveTo(1120, 120, 0.8);
  await hold(1.0);
  await click(btn('Mint test AUSD'), { ctx: [btn('Deposit'), page.getByText('Amount (AUSD)').first()], dur: 0.5 });
  const t1 = await dead(async () => { await waitBal('lender', /^100,000\.00$/); });
  await focus([rcard('lender')], { pad: 50, at: t1 - 0.7 });
  await key('minted', [balSpan('lender')], {}, t1);
  await hl([balSpan('lender')], 2.4, t1 + 0.3);
  meta.lenderMinted = await balText('lender');
  label(`Lender: ${meta.lenderMinted} AUSD`, 3.0, { pos: 'bl' });
  await hold(2.2);
  await focus([btn('Mint test AUSD'), btn('Deposit')], { pad: 70 });
  await sleep(300);
  const first = await page.locator('a[href*="/tx/"]').first().getAttribute('href').catch(() => null);
  await click(btn('Deposit'), { ctx: [btn('Mint test AUSD')], log: false, dur: 0.4 });
  await dead(async () => {
    await page.waitForFunction((h) => { const a = document.querySelector('a[href*="/tx/"]'); return a && a.getAttribute('href') !== h; }, first);
    const end = Date.now() + 15000;
    while (Date.now() < end && (await totalAssets()) === meta.poolBefore) await sleep(150);
  });
  meta.poolAfter = await totalAssets();
  log('pool', meta.poolBefore, '->', meta.poolAfter);
  await focus([text('Total assets').locator('xpath=..'), text('Your position').locator('xpath=..'), text('Your shares').locator('xpath=..')], { pad: 40 });
  await key('deposit', [text('Total assets').locator('xpath=..')]);
  await hl([text('Total assets').locator('xpath=..').locator('div').nth(1)], 2.4);
  label(`Pool balance ${meta.poolBefore} → ${meta.poolAfter}`, 3.4, { pos: 'bl' });
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
  meta.expBefore = await balText('exporter');
  await focus([text('Advance offer'), btn('Accept offer'), btn('Finance again')], { pad: 70 });
  await click(btn('Accept offer'), { ctx: [text('Advance offer')], log: false, dur: 0.5 });
  const t1 = await dead(async () => { await text(/confirmed in \d+ ms/).waitFor(); await waitBal('exporter', /^39,000\.00$/); }, 200);
  meta.acceptMs = (await text(/confirmed in \d+ ms/).innerText()).match(/\d+ ms/)?.[0];
  meta.expAfterAccept = await balText('exporter');
  log('accept ms', meta.acceptMs, 'exporter', meta.expBefore, '->', meta.expAfterAccept);
  await focus([rcard('exporter')], { pad: 50, at: t1 - 0.85 });          // camera is already on the exporter card when the balance flips
  await key('accept', [balSpan('exporter')], {}, t1);
  await hl([balSpan('exporter')], 2.6, t1 + 0.3);
  label(`Exporter: ${meta.expBefore} → ${meta.expAfterAccept} AUSD`, 3.2, { pos: 'bl' });
  await hold(2.6);
  await focus([text(/Advance sent:/)], { pad: 120, minW: 900 });
  await hl([text(/confirmed in \d+ ms/)], 2.6);
  label(`Pool sent 39,000 AUSD · confirmed in ${meta.acceptMs}`, 3.4, { pos: 'bl' });
  await hold(2.0);
});

await beat('pay', async () => {
  await goTab('Buyer', () => text('2. Pay').waitFor());
  const wf = () => page.locator('div.grid-cols-3').first().locator('xpath=..');
  await focus([card('2. Pay')], { pad: 30, minW: 900 });
  await sleep(300);
  await click(btn('Pay'), { ctx: [wf()], log: false, dur: 0.5 });
  const t1 = await dead(async () => { await page.locator('.d-stamp-lg').first().waitFor(); await text(/confirmed in \d+ ms/).waitFor(); await waitBal('exporter', /^47,7\d\d\.\d\d$/); }, 200);
  meta.payMs = (await text(/confirmed in \d+ ms/).innerText()).match(/\d+ ms/)?.[0];
  meta.expAfterPay = await balText('exporter');
  log('pay ms', meta.payMs, 'exporter', meta.expAfterAccept, '->', meta.expAfterPay);
  const rw = () => page.locator('div.grid-cols-3').last().locator('xpath=..');
  const leg = (i) => page.locator('div.grid-cols-3').last().locator('> div').nth(i);
  const receipt = () => [page.locator('.d-stamp-lg').first(), rw(), text(/confirmed in \d+ ms/)];
  await focus([rcard('exporter')], { pad: 50, at: t1 - 0.85 });
  await key('paid', receipt(), {}, t1);
  await hl([balSpan('exporter')], 2.6, t1 + 0.3);
  label(`Exporter: ${meta.expAfterAccept} → ${meta.expAfterPay} AUSD`, 3.0, { pos: 'bl' });
  await hold(1.7);
  meta.legs = await page.locator('div.grid-cols-3').last().innerText();
  log('legs', meta.legs.replace(/\n/g, ' '));
  await focus(receipt(), { pad: 40 });
  await hold(0.3);
  await hl([leg(0)], 1.9); label('Pool: principal + interest', 2.0, { pos: 'bl' }); await hold(1.9);
  await hl([leg(1)], 1.4); label('Platform fee', 1.5, { pos: 'bl' }); await hold(1.45);
  await hl([leg(2)], 2.0); label('Exporter keeps the rest', 2.2, { pos: 'bl' }); await hold(2.1);
});

await beat('why', async () => {
  const msLine = text(/confirmed in \d+ ms/);
  const txLink = page.locator('a[href*="/tx/"]').first();
  await focus([txLink, msLine, page.locator('.d-stamp-lg').first()], { pad: 80, minW: 900 });
  await key('why', [msLine]);
  await hl([msLine], 2.2);
  label('Monad: 400 ms blocks · fast finality', 3.2, { pos: 'bl' });
  await hold(2.0);
  await hover(txLink, 0.6);                      // hover only: the explorer link for the payment
  await hl([txLink], 1.6);
  label('Explorer tx link for the payment', 1.7, { pos: 'bl' });
  await hold(1.7);
  await focus([roleName('lender'), loginBtn('buyer')], { pad: 50 });
  await hl([balSpan('lender')], 1.4, T() + 0.4);
  await hl([balSpan('exporter')], 1.4, T() + 1.0);
  await hl([balSpan('buyer')], 1.4, T() + 1.6);
  label('One asset for everyone: AUSD', 2.8, { pos: 'bl' });
  await hold(3.0);
  label('Testnet AUSD: 6-decimal mock', 4.2, { pos: 'bl', sub: 'same interface · the token address is config' });
  await moveTo(1180, 330, 0.9);
  await hold(4.0);
});

await beat('end', async () => {
  await focus([roleName('lender'), loginBtn('buyer')], { pad: 50 });
  await moveTo(1700, 760, 0.8);
  E('endcard');
  await hold(4.0);
});
}
} catch (e) { console.error('FAILED', e); await page.screenshot({ path: `${RAW}/fail.png` }).catch(() => {}); }
await sleep(800);
E('stop');
await cdp.send('Page.stopScreencast');
await sleep(500);
fs.writeFileSync(`${RAW}/frames.json`, JSON.stringify(frames));
fs.writeFileSync(`${RAW}/events.json`, JSON.stringify({ ev, mouse, meta }, null, 0));
log('frames', frames.length, 'meta', JSON.stringify(meta));
await ctx.close(); await browser.close();
