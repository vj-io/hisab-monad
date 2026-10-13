"""Compositor: raw 4K screencast frames + event log -> 1920x1080 30fps video with a virtual camera.
Usage (from demo/zoom):
  ../.venv/bin/python compose.py plan     # timeline, voice script, sfx list, label list -> plan.json (+ labels.json)
  (node overlays.mjs)                     # renders ov/*.png sprites from labels.json
  ../.venv/bin/python audio.py            # narration + music + sfx -> final.wav
  ../.venv/bin/python compose.py render [t0 t1]   # frames -> hisab-monad-zoom.mp4 (optionally only a time range, to preview.mp4)
"""
import json, math, sys, os, bisect, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageChops

FPS, W, H = 30, 1920, 1080
ZMAX = 2.6
LEAD = 0.18           # camera starts moving slightly before its logged moment
GAP = 0.30            # min silence after a line inside a beat
D = json.load(open('raw/events.json'))
EV, MOUSE, META = D['ev'], D['mouse'], D['meta']
FR = json.load(open('raw/frames.json'))
NAR = json.load(open('narration.json'))
TIM = json.load(open('timings.json'))
VDUR = {n['id']: t['dur'] for n, t in zip(NAR, TIM)}
VTXT = {n['id']: n['text'] for n in NAR}
T0 = next(e['t'] for e in EV if e['k'] == 'start')
for e in EV: e['t'] -= T0
MOUSE = [(m[0] - T0, m[1], m[2]) for m in MOUSE]
FR = [f - T0 for f in FR]
MT = [m[0] for m in MOUSE]

def ms(key):
    v = META.get(key, '0 ms')
    return int(v.split()[0]) / 1000

TAIL = {'accept': ms('acceptMs') + 0.4, 'pay': ms('payMs') + 0.4}   # keep the real confirm latency at 1x
ALIGN = {  # beat -> (key event, fraction of the line at which that result should land)
    'wallets': ('privy', 0.40), 'load': ('seeded', 0.42), 'lender': ('deposit', 0.62), 'ack': ('acked', 0.50),
    'accept': ('accept', 0.30), 'again': ('locked', 0.40), 'pay': ('paid', 0.27), 'tier2': ('tier2', 0.15),
    'share': ('share', 0.12), 'explorer': ('timeline', 0.10),
}
PUNCH = {'accept': .10, 'paid': .11, 'locked': .10, 'offer': .08, 'offer2': .09, 'share': .08, 'seeded': .07,
         'deposit': .07, 'acked': .07, 'tier2': .08, 'privy': .06, 'timeline': .06, 'why': .06}
SFX_KEY = {'accept': 'ding', 'paid': 'thud', 'locked': 'thud', 'offer': 'ding', 'offer2': 'ding', 'share': 'ding', 'seeded': 'ding',
           'deposit': 'ding', 'acked': 'ding', 'tier2': 'ding', 'privy': 'pop', 'timeline': 'pop', 'why': 'pop'}

def cdead(d): return d if d < 1.3 else max(d / 6, min(d, 0.9 + 0.1 * d))

# ---------------- beats / segments ----------------
def build_beats():
    beats = []
    cur = None
    for i, e in enumerate(EV):
        if e['k'] == 'beat': cur = dict(id=e['id'], s=e['t'], off=e['off'], segs=[], keys=[], foc=[], mark=e['t'])
        elif cur is None: continue
        elif e['k'] in ('hold', 'dead'):
            if e['on']: cur['_open'] = (e['k'], e['t'])
            else:
                kind, a = cur.pop('_open')
                cur['segs'].append((a, e['t'], kind))
        elif e['k'] == 'beatEnd': cur['e'] = e['t']; beats.append(cur); cur = None
    for b in beats:  # fill live segments between marked ones
        segs, t = [], b['s']
        for a, c, kind in sorted(b['segs']):
            if a > t + 1e-6: segs.append((t, a, 'live'))
            segs.append((a, c, kind)); t = c
        if b['e'] > t + 1e-6: segs.append((t, b['e'], 'live'))
        b['segs'] = segs
    return beats

def dead_out(d, tail):
    tail = min(d, tail); head = d - tail
    return cdead(head) + tail if head > 1.3 else d

def seg_len(seg, bid):
    a, c, kind = seg
    return dead_out(c - a, TAIL.get(bid, 0)) if kind == 'dead' else c - a

def warp_dead(u, d, tail):
    """local output time u (0..L) -> source offset within a dead segment. Ramps 1x -> S -> 1x on the head, tail is 1x."""
    tail = min(d, tail); head = d - tail
    if head <= 1.3: return u
    Lh = cdead(head)
    if u >= Lh: return head + (u - Lh)
    r = min(0.3, Lh / 3)
    S = 1 + (head - Lh) / (Lh - r)
    def Wint(x):  # integral of ramp-profile w over [0,x]
        if x <= r: s = x / r; return r * (s ** 3 - s ** 4 / 2)
        if x <= Lh - r: return r / 2 + (x - r)
        s = (Lh - x) / r; return (Lh - r) - r * (s ** 3 - s ** 4 / 2)
    return u + (S - 1) * Wint(u)

def layout():
    beats = build_beats()
    for b in beats: b['natural'] = sum(seg_len(s, b['id']) for s in b['segs'])
    # keys / focus per beat (source time)
    for e in EV:
        for b in beats:
            if b['s'] <= e['t'] <= b['e']:
                if e['k'] == 'key': b['keys'].append(e)
    CL = 0.3 + VDUR['cold'] + 0.45
    out = CL
    for b in beats:
        bid = b['id']; dur = VDUR[bid]
        # local out time of a source time (before stretch)
        def loc(ts, b=b):
            u = 0
            for a, c, kind in b['segs']:
                if ts <= a: break
                if ts >= c: u += seg_len((a, c, kind), b['id']); continue
                if kind == 'dead':
                    u += seg_len((a, c, kind), b['id']) * (ts - a) / (c - a); break
                u += ts - a; break
            return u
        off = max(0.15, b['off'])
        if bid in ALIGN:
            kn, fr = ALIGN[bid]
            k = next((k for k in b['keys'] if k['name'] == kn), None)
            if k: off = min(2.2, max(0.15, loc(k['t']) - 0.3 - fr * dur))
        req = off + dur + GAP
        hold_src = sum(c - a for a, c, k in b['segs'] if k == 'hold')
        f = 1.0
        if hold_src > 0.5:
            f = (hold_src + (req - b['natural'])) / hold_src
            f = min(1.35, max(0.75, f))
        L = max(req, b['natural'] - hold_src + hold_src * f)
        b.update(off=off, L=L, f=f, out0=out, loc=loc)
        out += L
    END = out
    return beats, CL, END

BEATS, CL, END = layout()
TOTAL = END + 0.4

def src_of(t):
    """output time -> source time (relative to T0), main timeline."""
    if t < CL: return None
    for b in BEATS:
        if t < b['out0'] + b['L'] or b is BEATS[-1]:
            u = t - b['out0']
            for a, c, kind in b['segs']:
                if kind == 'hold': l = (c - a) * b['f']
                else: l = seg_len((a, c, kind), b['id'])
                if u <= l:
                    if kind == 'dead': return a + warp_dead(u, c - a, TAIL.get(b['id'], 0))
                    if kind == 'hold': return a + u / b['f']
                    return a + u
                u -= l
            return b['e']  # freeze after content ends
    return BEATS[-1]['e']

def out_of(ts):
    """source time -> output time (main timeline)."""
    for b in BEATS:
        if b['s'] - 1e-6 <= ts <= b['e'] + 1e-6:
            u = 0
            for a, c, kind in b['segs']:
                if ts <= a: break
                if kind == 'hold': l = (c - a) * b['f']
                else: l = seg_len((a, c, kind), b['id'])
                if ts >= c: u += l; continue
                u += l * (ts - a) / (c - a); break
            return b['out0'] + u
    return None

# ---------------- camera ----------------
def crop_for(e):
    if e.get('wide'): return (960.0, 540.0, 1920.0)
    r = e['rect']; pad = e.get('pad', 56)
    if r['w'] < 300 and 600 < r['x'] < 1100 and r['h'] < 60: r = dict(x=968, y=r['y'] - 20, w=490, h=r['h'] + 70)   # label-only rows (Credit tier): take the whole row
    if r['y'] < 200 and r['h'] < 150 and r['w'] > 300: r = dict(x=448, y=64, w=1024, h=150)   # wallet bar: always the whole bar
    w = max(r['w'] + 2 * pad, (r['h'] + 2 * pad) * 16 / 9, e.get('minW', 760), W / ZMAX)
    w = min(w, W); h = w * 9 / 16
    cx = min(max(r['x'] + r['w'] / 2, w / 2), W - w / 2); cy = min(max(r['y'] + r['h'] / 2, h / 2), H - h / 2)
    return (cx, cy, w)

def ease(u):
    u = min(1, max(0, u)); return 4 * u ** 3 if u < .5 else 1 - (-2 * u + 2) ** 3 / 2

def build_camera():
    kfs = []  # (t_out, crop, dur)
    for b in BEATS:
        for e in EV:
            if e['k'] == 'focus' and b['s'] - 1e-6 <= e['t'] <= b['e'] + 1e-6:
                to = out_of(e['t'])
                if to is not None: kfs.append((max(0, to - LEAD), crop_for(e), e))
    kfs.sort(key=lambda k: k[0])
    punches = []
    for b in BEATS:
        for k in b['keys']:
            to = out_of(k['t'])
            if to is not None and k['name'] in PUNCH: punches.append((to - 0.25, PUNCH[k['name']]))
    n = int(TOTAL * FPS) + 1
    cams = np.zeros((n, 3))
    cur = (960.0, 540.0, 1920.0); tr = None; ki = 0; settle = 0.0
    kt_hist = []
    prev_target = cur
    for i in range(n):
        t = i / FPS
        while ki < len(kfs) and kfs[ki][0] <= t:
            tt, tgt, e = kfs[ki]
            dz = abs(math.log(tgt[2] / cur[2])); dd = math.hypot(tgt[0] - cur[0], tgt[1] - cur[1]) / 1000
            dur = min(0.95, 0.52 + 0.28 * dz + 0.25 * dd)
            tr = (tt, cur, tgt, dur); settle = tt + dur; ki += 1
        if tr:
            tt, a, b2, dur = tr; u = ease((t - tt) / dur)
            cx = a[0] + (b2[0] - a[0]) * u; cy = a[1] + (b2[1] - a[1]) * u
            w = math.exp(math.log(a[2]) + (math.log(b2[2]) - math.log(a[2])) * u)
        else: cx, cy, w = cur
        cur = (cx, cy, w)
        # slow push-in + drift while settled, punch on key moments
        creep = 1 - 0.04 * ease((t - settle) / 3.5) if (tr and w < 1800) else 1
        wd = w * creep
        for pt, amp in punches:
            d = t - pt
            if 0 <= d < 1.4: wd *= 1 - amp * (math.sin(min(d / 0.12, 1) * math.pi / 2) * math.exp(-max(0, d - 0.12) / 0.38))
        dx = 0.006 * wd * math.sin(0.9 * t + 1.1); dy = 0.005 * wd * math.cos(0.7 * t)
        wd = min(max(wd, W / ZMAX), W); hd = wd * 9 / 16
        cams[i] = (min(max(cx + dx, wd / 2), W - wd / 2), min(max(cy + dy, hd / 2), H - hd / 2), wd)
    return cams

# cold open definition ----------------------------------------------------
def cold_spec():
    def rt(bid):
        b = next(b for b in BEATS if b['id'] == bid)
        d = [e for e in EV if e['k'] == 'dead' and not e['on'] and b['s'] <= e['t'] <= b['e']][-1]
        foc = [e for e in EV if e['k'] == 'focus' and b['s'] <= e['t'] <= b['e'] and e['t'] >= d['t'] - 0.1][0]
        return d['t'], foc
    ta, fa = rt('accept'); tp, fp = rt('pay')
    A = dict(src0=ta - 1.0, len=3.45, crop=crop_for(fa)); B = dict(src0=tp - 0.7, len=CL - 0.0 - A['len'] - 0.0, crop=crop_for(fp))
    return A, B

def src_frame_idx(ts):
    return max(0, bisect.bisect_right(FR, ts) - 1)

def mouse_at(ts):
    i = bisect.bisect_right(MT, ts) - 1
    if i < 0: return MOUSE[0][1:]
    if i >= len(MOUSE) - 1: return MOUSE[-1][1:]
    a, b = MOUSE[i], MOUSE[i + 1]
    u = (ts - a[0]) / max(1e-6, b[0] - a[0]); u = min(1, max(0, u))
    return (a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u)

CLICKS = [(e['t'], e['x'], e['y']) for e in EV if e['k'] == 'click']

# ---------------- overlays ----------------
def overlay_items():
    items, hls = [], []
    for b in BEATS:
        for e in EV:
            if b['s'] - 1e-6 <= e['t'] <= b['e'] + 1e-6:
                if e['k'] == 'label':
                    to = out_of(e['t'])
                    items.append(dict(text=e['text'], t=to, secs=min(e['secs'], b['out0'] + b['L'] - to + 0.25), id='L%03d' % len(items)))
                if e['k'] == 'hl':
                    to = out_of(e['t'])
                    hls.append(dict(t=to, secs=e['secs'], rect=e['rect'], bend=b['out0'] + b['L']))
    return items, hls

def focus_at(ts):
    f = None
    for e in EV:
        if e['t'] > ts: break
        if e['k'] == 'focus': f = e
    return f

def plan():
    items, hls = overlay_items()
    voice = [{'t': round(CL * 0 + 0.3, 3), 'text': VTXT['cold']}] + [{'t': round(b['out0'] + b['off'], 3), 'text': VTXT[b['id']]} for b in BEATS]
    sfx = []
    for ck, _, _ in CLICKS:
        to = out_of(ck)
        if to is not None: sfx.append((round(to, 3), 'click'))
    for b in BEATS:
        for k in b['keys']:
            if k['name'] in SFX_KEY:
                to = out_of(k['t'])
                if to: sfx.append((round(to - 0.3, 3), SFX_KEY[k['name']]))
    cams = build_camera()
    # whooshes at big zoom changes
    for i in range(1, len(cams)):
        pass
    kfs = [(out_of(e['t']), crop_for(e)) for e in EV if e['k'] == 'focus' and out_of(e['t']) is not None]
    prev = (960, 540, 1920)
    for to, c in kfs:
        if abs(math.log(c[2] / prev[2])) > 0.28 or math.hypot(c[0] - prev[0], c[1] - prev[1]) > 420: sfx.append((round(to - LEAD, 3), 'whoosh'))
        prev = c
    sfx.append((0.05, 'whoosh')); sfx.append((CL - 0.2, 'whoosh'))
    sfx.sort()
    # drop whooshes closer than 0.9 s together
    keep, lastw = [], -9
    for t, k in sfx:
        if k == 'whoosh':
            if t - lastw < 0.9: continue
            lastw = t
        keep.append((t, k))
    P = dict(CL=CL, END=END, TOTAL=TOTAL, voice=voice, sfx=keep, labels=items,
             beats=[dict(id=b['id'], out0=round(b['out0'], 2), L=round(b['L'], 2), off=round(b['off'], 2), natural=round(b['natural'], 2), f=round(b['f'], 2), freeze=round(max(0, b['L'] - b['natural'] * 1.0), 2)) for b in BEATS])
    json.dump(P, open('plan.json', 'w'), indent=1)
    json.dump({'off': {b['id']: round(b['off'], 2) for b in BEATS}}, open('offsets_suggest.json', 'w'))
    lab = [dict(id=i['id'], text=i['text']) for i in items]
    lab += [dict(id='chip', type='chip', text='LIVE · Monad testnet'), dict(id='title', type='title', text='Same-day dollar advances for exporters'), dict(id='end', type='end', text='')]
    json.dump(lab, open('labels.json', 'w'))
    for b in P['beats']: print(b)
    print('CL', round(CL, 2), 'END', round(END, 2), 'TOTAL', round(TOTAL, 2))
    return P

# ---------------- rendering ----------------
SPR = {}
def load_sprites():
    if SPR: return
    sizes = json.load(open('ov/sizes.json'))
    for k, (w, h) in sizes.items():
        im = Image.open(f'ov/{k}.png').convert('RGBA')
        SPR[k] = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)

@functools.lru_cache(maxsize=64)
def cursor_sprite(scale10):
    s = scale10 / 10
    base = [(0, 0), (0, 25), (6.5, 19.5), (11, 30), (16, 27.5), (11.5, 18), (19.5, 18)]
    K = 6
    pts = [(x * s * K + 6 * K, y * s * K + 6 * K) for x, y in base]
    size = (int(34 * s * K) + 12 * K, int(40 * s * K) + 12 * K)
    im = Image.new('RGBA', size, (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(255, 255, 255, 255), width=int(4.5 * s * K))
    d.polygon(pts, fill=(10, 10, 10, 255))
    sm = im.resize((size[0] // K, size[1] // K), Image.LANCZOS)
    return sm, 6 // 1 if False else 1

_CACHE = {'idx': -1, 'im': None}
def get_frame(idx):
    if _CACHE['idx'] != idx:
        _CACHE['im'] = Image.open(f'raw/{idx:06d}.jpg').convert('RGB'); _CACHE['idx'] = idx
    return _CACHE['im']

def paste_sprite(img, spr, x, y, alpha=1.0):
    if alpha <= 0.01: return
    if alpha < 0.99:
        a = spr.getchannel('A').point(lambda v: int(v * alpha)); spr = spr.copy(); spr.putalpha(a)
    img.paste(spr, (int(x), int(y)), spr)

def render_frame(spec):
    """spec: dict with src_idx, crop (cx,cy,w), cursor, ripples, hls, sprites, flash"""
    load_sprites()
    cx, cy, w = spec['crop']; h = w * 9 / 16
    src = get_frame(spec['src_idx'])
    k = src.width / W
    box = ((cx - w / 2) * k, (cy - h / 2) * k, (cx + w / 2) * k, (cy + h / 2) * k)
    img = src.resize((W, H), Image.BICUBIC if w < 1500 else Image.LANCZOS, box=box)
    z = W / w
    P = lambda x, y: ((x - (cx - w / 2)) * z, (y - (cy - h / 2)) * z)
    # highlighter swipes (multiply, so ink text stays dark)
    for hl in spec['hls']:
        r = hl['rect']; x0, y0 = P(r['x'], r['y'] + r['h'] * 0.38); x1, y1 = P(r['x'] + r['w'], r['y'] + r['h'] + 2)
        x1 = x0 + (x1 - x0) * hl['prog']
        bx = (int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1)))
        if bx[2] > bx[0] and bx[3] > bx[1]:
            reg = img.crop(bx); tint = Image.new('RGB', reg.size, (205, 255, 0))
            img.paste(Image.blend(reg, ImageChops.multiply(reg, tint), 0.85 * hl['alpha']), bx[:2])
    # ripples + cursor
    if spec['ripples'] or spec['cursor']:
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for (x, y, rad, a) in spec['ripples']:
            sx, sy = P(x, y)
            d.ellipse([sx - rad, sy - rad, sx + rad, sy + rad], fill=(200, 255, 0, int(150 * a)), outline=(10, 10, 10, int(255 * a)), width=4)
        img.paste(lay, (0, 0), lay)
        if spec['cursor']:
            x, y, sc = spec['cursor']; sx, sy = P(x, y)
            spr, _ = cursor_sprite(int(round(sc * 10)))
            if -50 < sx < W + 50 and -50 < sy < H + 50: img.paste(spr, (int(sx - 6), int(sy - 6)), spr)
    for (name, x, y, a) in spec['sprites']: paste_sprite(img, SPR[name], x, y, a)
    if spec['flash'] > 0.01:
        fl = Image.new('RGB', (W, H), (200, 255, 0)); img = Image.blend(img, fl, min(0.85, spec['flash']))
    return img

def spec_for(i, cams, labs, hlsl):
    t = i / FPS
    spec = dict(sprites=[], hls=[], ripples=[], flash=0.0, cursor=None)
    if t < CL:
        A, B = cold_spec()
        clip, lt = (A, t) if t < A['len'] else (B, t - A['len'])
        src_t = clip['src0'] + lt
        cx, cy, w = clip['crop']; p = ease(lt / clip['len']); w2 = min(W, w * (1.28 - 0.28 * p))
        h2 = w2 * 9 / 16; spec['crop'] = (min(max(cx, w2 / 2), W - w2 / 2), min(max(cy, h2 / 2), H - h2 / 2), w2)
        spec['flash'] = max(0, 1 - abs(t - A['len']) / 0.1) * 0.8
        if t > 3.55: spec['sprites'].append(('title', 60 + 0, H - 60 - SPR_H('title') + 14 * (1 - ease((t - 3.55) / 0.3)), min(1, (t - 3.55) / 0.25)))
    else:
        src_t = src_of(t)
        spec['crop'] = tuple(cams[i])
        if t < CL + 0.12: spec['flash'] = (1 - (t - CL) / 0.12) * 0.8
    spec['src_idx'] = src_frame_idx(src_t + 0.03)
    cx, cy, w = spec['crop']; z = W / w
    # cursor + click ripples (source-time driven so they stay in sync with the page)
    mxm, mym = mouse_at(src_t)
    press = any(0 <= src_t - ck < 0.11 for ck, _, _ in CLICKS)
    spec['cursor'] = (mxm, mym, (1.0 + 0.3 * (z - 1) * 0.8) * (0.86 if press else 1.0))
    for ck, kx, ky in CLICKS:
        d = src_t - ck
        if 0 <= d < 0.65:
            u = d / 0.65; spec['ripples'].append((kx, ky, (14 + 70 * (1 - (1 - u) ** 3)) * (0.8 + 0.2 * z), 1 - u))
    # highlighter
    for hl in hlsl:
        d = t - hl['t']
        if 0 <= d < min(hl['secs'], hl['bend'] - hl['t'] + 0.2):
            spec['hls'].append(dict(rect=hl['rect'], prog=ease(d / 0.4), alpha=min(1, (hl['secs'] - d) / 0.4) if d > hl['secs'] - 0.4 else 1))
    # labels
    for lb in labs:
        d = t - lb['t']
        if 0 <= d < lb['secs'] + 0.0:
            a = min(1, d / 0.22) * min(1, (lb['secs'] - d) / 0.25 + 0.0)
            sw, sh = SPR_SIZE(lb['id'])
            foc = focus_at(src_of(max(t, CL)) or 0)
            fr = None
            if foc and not foc.get('wide'):
                r = foc['rect']; x0, y0 = ((r['x'] - (cx - w / 2)) * z, (r['y'] - (cy - h_of(w) / 2)) * z)
                fr = (x0, y0, x0 + r['w'] * z, y0 + r['h'] * z)
            cands = [(56, H - 56 - sh), (W - 56 - sw, H - 56 - sh), (56, 56 + 70), (W - 56 - sw, 56 + 70)]
            best = min(cands, key=lambda p: overlap((p[0], p[1], p[0] + sw, p[1] + sh), fr))
            slide = 22 * (1 - ease(d / 0.28))
            spec['sprites'].append((lb['id'], best[0], best[1] + slide, max(0, a)))
    spec['sprites'].append(('chip', W - 60 - SPR_SIZE('chip')[0], 28, 0.95))
    if t > END - 0.0:
        pass
    # end card
    ec = [e for e in EV if e['k'] == 'endcard']
    if ec:
        te = out_of(ec[0]['t'])
        if te is not None and t >= te + 0.5:
            sw, sh = SPR_SIZE('end'); a = min(1, (t - te - 0.5) / 0.35)
            spec['sprites'].append(('end', (W - sw) / 2, H - 70 - sh + 24 * (1 - ease((t - te - 0.5) / 0.4)), a))
    return spec

def h_of(w): return w * 9 / 16
def SPR_SIZE(k): load_sprites(); return SPR[k].size
def SPR_H(k): return SPR_SIZE(k)[1]
def overlap(a, b):
    if b is None: return 0
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy

# ---------------- worker pool ----------------
def work(args):
    lo, hi, cams, labs, hlsl = args
    out = []
    for i in range(lo, hi):
        out.append(render_frame(spec_for(i, cams, labs, hlsl)).tobytes())
    return out

def render(t0=0, t1=None, out='hisab-monad-zoom.mp4'):
    import multiprocessing as mp
    import imageio_ffmpeg
    P = plan() if not os.path.exists('plan.json') else json.load(open('plan.json'))
    P = plan()
    load_sprites()
    cams = build_camera(); labs = P['labels']; _, hlsl = overlay_items()
    n = int(TOTAL * FPS) if t1 is None else int(t1 * FPS)
    lo = int(t0 * FPS)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    audio = ['-i', 'final.wav'] if os.path.exists('final.wav') else []
    ss = ['-ss', str(t0)] if t0 else []
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-'] + (ss + audio) + \
          ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS)] + \
          (['-c:a', 'aac', '-b:a', '160k', '-shortest'] if audio else []) + ['-movflags', '+faststart', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    CH = 12
    jobs = [(a, min(n, a + CH), cams, labs, hlsl) for a in range(lo, n, CH)]
    with mp.get_context('fork').Pool(max(2, (os.cpu_count() or 4) - 1)) as pool:
        for k, chunk in enumerate(pool.imap(work, jobs)):
            for fb in chunk: proc.stdin.write(fb)
            if k % 20 == 0: print('frames', jobs[k][1], '/', n, flush=True)
    proc.stdin.close(); proc.wait()
    print('wrote', out)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'plan': plan()
    elif cmd == 'render':
        a = [float(x) for x in sys.argv[2:4]]
        if a: render(a[0], a[1], 'preview.mp4')
        else: render()
