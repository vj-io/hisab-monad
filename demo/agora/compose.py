"""Agora demo compositor: raw screencast frames + event log -> 1920x1080 30fps video with a virtual camera.
Adapted from demo/zoom/compose.py. Timeline: cold open -> context doodle -> PASSKEY SLOT (SLOT s) -> recorded beats -> end.
The video is rendered in three parts so the user's passkey clip can be spliced in without re-rendering everything:
  A = [0, SLOT0)   B = [SLOT0, SLOT1) (preview footage of the real login window; splice.py swaps in passkey.mov)   C = [SLOT1, TOTAL)
Usage (from demo/agora, python = ~/.claude/brag-scaled-venv/bin/python):
  python compose.py plan            # timeline, voice script, sfx list, labels -> plan.json + labels.json, prints the beat list + audit
  (node overlays.mjs)               # renders ov/*.png sprites from labels.json (labels, title, end card, note, checklist states)
  (node ctx.mjs)                    # renders ctx/*.jpg (context doodle) once the context length is known
  python audio.py                   # narration + music + sfx -> final.wav
  python compose.py parts           # renders parts/A.mp4, parts/B_preview.mp4, parts/C.mp4
  python compose.py render t0 t1    # preview of a time range -> preview_range.mp4
  python splice.py [--clip passkey.mov]   # assembles hisab-agora.mp4 (with the user clip) or hisab-agora-preview.mp4
"""
import json, math, sys, os, bisect, subprocess, functools
import numpy as np
from PIL import Image, ImageDraw, ImageChops

FPS, W, H = 30, 1920, 1080          # output
SW, SH = 1920, 1500                 # source (CSS px of the recorded viewport)
ZMAX = 2.6
LEAD = 0.18           # camera starts moving slightly before its logged moment
GAP = 0.30            # min silence after a line inside a beat
SLOT = 18.0           # passkey slot length (s)
SLOT_VOICE = [0.4, 2.3, 6.6, 11.7]   # slot-relative start of the four slot sentences (anchored to the user's clip: click ~4.3, sheet 4.6-7.6, card ~9.5)
PK_TICK = 9.85        # slot-relative moment the buyer card reads 'passkey wallet' (checklist tick 1)
TICK_DUR = 0.6        # checklist tick animation
CAMCFG = json.load(open('passkey_cam.json')) if os.path.exists('passkey_cam.json') and os.path.exists('passkey.mov') else None   # user's clip present -> final mode
if CAMCFG: SLOT, PK_TICK = CAMCFG['slot'], CAMCFG['tick']
RAW = os.environ.get('RAW', 'raw')
D = json.load(open(f'{RAW}/events.json'))
EV, MOUSE, META = D['ev'], D['mouse'], D['meta']
FR = json.load(open(f'{RAW}/frames.json'))
NAR = json.load(open('narration.json'))
TIM = json.load(open('timings.json'))
VDUR = {n['id']: t['dur'] for n, t in zip(NAR, TIM)}
VTXT = {n['id']: n['text'] for n in NAR}
EV.sort(key=lambda e: e['t'])    # retroactive events (balance-flip keyframes) are logged out of order
T0 = next(e['t'] for e in EV if e['k'] == 'start')
for e in EV: e['t'] -= T0
MOUSE = [(m[0] - T0, m[1], m[2]) for m in MOUSE]
FR = [f - T0 for f in FR]
MT = [m[0] for m in MOUSE]
q = lambda x: math.ceil(x * FPS - 1e-6) / FPS   # quantise to a whole frame

def ms(key):
    v = META.get(key, '0 ms')
    return int(v.split()[0]) / 1000

TAIL = {'accept': ms('acceptMs') + 0.4, 'pay': ms('payMs') + 0.4, 'lender': 1.6}   # keep the real confirm latency at 1x
ALIGN = {  # beat -> (key event, fraction of the line at which that result should land)
    'load': ('seeded', 0.45), 'lender': ('minted', 0.55), 'ack': ('acked', 0.50), 'accept': ('accept', 0.50), 'pay': ('paid', 0.36),
}
PUNCH = {'accept': .10, 'paid': .11, 'minted': .08, 'deposit': .07, 'offer': .08, 'seeded': .07, 'acked': .07, 'privy': .06, 'why': .06}
SFX_KEY = {'accept': 'thud', 'paid': 'thud', 'minted': 'ding', 'deposit': 'ding', 'offer': 'ding', 'seeded': 'ding', 'acked': 'ding', 'privy': 'pop', 'why': 'pop'}

SKIP_FIRST_DEAD = ('ack', 'pay', 'lender', 'accept')   # tab-load waits show 'Invoice not found' / empty-state flashes: cut them
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
        if b['id'] in SKIP_FIRST_DEAD:   # Buyer tab shows 'Invoice not found' while its data loads: hard-skip that wait
            for k, (a, c, kind) in enumerate(segs):
                if kind == 'dead': segs[k] = (a, c, 'skip'); break
        b['segs'] = segs
    return beats

def dead_out(d, tail):
    tail = min(d, tail); head = d - tail
    return cdead(head) + tail if head > 1.3 else d

def seg_len(seg, bid):
    a, c, kind = seg
    if kind == 'skip': return 0.0
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

CL = q(0.3 + VDUR['cold'] + 0.5)          # cold open
CTX = q(0.3 + VDUR['ctx'] + 0.45)         # context doodle
N_CTX = round(CTX * FPS)

def layout():
    beats = build_beats()
    for b in beats: b['natural'] = sum(seg_len(s, b['id']) for s in b['segs'])
    for e in EV:
        for b in beats:
            if b['s'] <= e['t'] <= b['e']:
                if e['k'] == 'key': b['keys'].append(e)
    out = CL + CTX
    for b in beats:
        bid = b['id']; dur = VDUR[bid]
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
        req = SLOT if bid == 'pk' else off + dur + GAP
        hold_src = sum(c - a for a, c, k in b['segs'] if k == 'hold')
        f = 1.0
        if hold_src > 0.5:
            f = (hold_src + (req - b['natural'])) / hold_src
            f = min(1.35, max(0.75, f))
        L = max(req, b['natural'] - hold_src + hold_src * f)
        if bid == 'pk': L = SLOT
        L = q(L)
        b.update(off=off, L=L, f=f, out0=out, loc=loc)
        out += L
    END = out
    return beats, END

BEATS, END = layout()
TOTAL = q(END + 0.4)
BEAT = {b['id']: b for b in BEATS}
SLOT0 = BEAT['pk']['out0']; SLOT1 = SLOT0 + SLOT

def src_of(t):
    """output time -> source time (relative to T0), main timeline."""
    if t < CL + CTX: return None
    for b in BEATS:
        if t < b['out0'] + b['L'] or b is BEATS[-1]:
            u = t - b['out0']
            for a, c, kind in b['segs']:
                if kind == 'hold': l = (c - a) * b['f']
                else: l = seg_len((a, c, kind), b['id'])
                if kind == 'skip':
                    if u <= 0: return c
                    continue
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

def key_out(bid, name):
    k = next(k for k in BEAT[bid]['keys'] if k['name'] == name)
    return out_of(k['t'])

# checklist: ticks fire the moment each requirement is shown
CK_T0 = CL + 0.25
T_PK = SLOT0 + PK_TICK
T_AUSD = key_out('lender', 'minted') + 0.30
T_SEND = key_out('accept', 'accept') + 0.30
TICKS = [T_PK, T_AUSD, T_SEND]
CK_VIS = (410, 214)       # visible checklist size (overlays.mjs asserts the same)
if os.path.exists('ov/sizes.json'):
    _s = json.load(open('ov/sizes.json'))
    if 'ck0' in _s: CK_VIS = (_s['ck0'][0] - 36, _s['ck0'][1] - 36)
CK_BOX = (W - 36 - CK_VIS[0], 24, W - 36, 24 + CK_VIS[1])      # screen px of the visible checklist box (top right)

# ---------------- camera ----------------
BAND = 0.21   # bottom/top strip of the crop kept free of the focus rect, for the callout label
def eff_rect(e):
    r = e['rect']
    if r['y'] < 200 and r['h'] < 150 and r['w'] > 600: r = dict(x=448, y=64, w=1024, h=150)   # wallet bar (all three cards): the whole bar
    return r

def overlap(a, b):
    if b is None: return 0
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy

def screen_box(r, crop, grow=0):
    cx, cy, w = crop; z = W / w
    x0 = (r['x'] - (cx - w / 2)) * z; y0 = (r['y'] - (cy - w * 9 / 32)) * z
    return (x0 - grow, y0 - grow, x0 + r['w'] * z + grow, y0 + r['h'] * z + grow)

def crop_raw(e, scale=1.0, dx=0.0):
    r = eff_rect(e); pad = e.get('pad', 56)
    w = max(r['w'] + 2 * pad, ((r['h'] + 2 * pad) / (1 - BAND)) * 16 / 9, e.get('minW', 760), W / ZMAX) * scale
    w = min(w, W); h = w * 9 / 16
    cx = min(max(r['x'] + r['w'] / 2 + dx, w / 2), SW - w / 2)
    mid = r['y'] + r['h'] / 2
    best = None
    for side in ('b', 't'):   # focus rect centred in the part of the crop that is not the label band
        top = mid - h * (1 - BAND) / 2 if side == 'b' else mid - h * (BAND + (1 - BAND) / 2)
        top = min(max(top, 0), SH - h)
        lo = top + (h * BAND if side == 't' else 0); hi = top + h - (h * BAND if side == 'b' else 0)
        if r['y'] - 10 >= lo and r['y'] + r['h'] + 10 <= hi: best = top; break
    if best is None: best = min(max(mid - h / 2, 0), SH - h)
    return (cx, best + h / 2, w)

CK_CLEAR = 66    # px kept between a focus rect and the checklist (camera drift / punch-in headroom)
def crop_for(e):
    """crop (cx, cy, w) for a focus event: centred in the live area, and never under the persistent checklist (motion-kit: frame the focus
    above persistent overlays). If the rect would reach the checklist: shift the crop sideways, else widen it."""
    if e.get('wide'): return (960.0, 540.0, 1920.0)
    r = eff_rect(e)
    ck = (CK_BOX[0] - CK_CLEAR, CK_BOX[1] - CK_CLEAR, CK_BOX[2] + CK_CLEAR, CK_BOX[3] + CK_CLEAR)
    for scale in (1.0, 1.05, 1.1, 1.17, 1.25, 1.35, 1.5, 1.7, 2.0, 3.0):
        c = crop_raw(e, scale)
        if not overlap(screen_box(r, c), ck): return c
        z = W / c[2]; bx = screen_box(r, c)
        need = (bx[2] - (ck[0] - 6)) / z          # shift the crop right so the rect moves left of the checklist
        if need > 0 and bx[0] - need * z >= 30:
            c2 = crop_raw(e, scale, need)
            if not overlap(screen_box(r, c2), ck): return c2
    return crop_raw(e, 3.0)

def ease(u):
    u = min(1, max(0, u)); return 4 * u ** 3 if u < .5 else 1 - (-2 * u + 2) ** 3 / 2

KF_INFO = []
def build_camera():
    KF_INFO.clear()
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
    for i in range(n):
        t = i / FPS
        while ki < len(kfs) and kfs[ki][0] <= t:
            tt, tgt, e = kfs[ki]
            dz = abs(math.log(tgt[2] / cur[2])); dd = math.hypot(tgt[0] - cur[0], tgt[1] - cur[1]) / 1000
            dur = min(0.95, 0.52 + 0.28 * dz + 0.25 * dd)
            tr = (tt, cur, tgt, dur); settle = tt + dur; ki += 1; KF_INFO.append((tt, dur))
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
        cams[i] = (min(max(cx + dx, wd / 2), SW - wd / 2), min(max(cy + dy, hd / 2), SH - hd / 2), wd)
    return cams

# cold open: the real moment the buyer's payment lands and splits --------------------------------------------
def cold_spec():
    b = BEAT['pay']
    d = [e for e in EV if e['k'] == 'dead' and not e['on'] and b['s'] <= e['t'] <= b['e']][-1]
    foc = [e for e in EV if e['k'] == 'focus' and b['s'] <= e['t'] <= b['e'] and e['t'] >= d['t'] - 0.1][0]
    return dict(src0=d['t'] - 1.15, len=CL, crop=crop_raw(foc))   # no checklist yet in the cold open: plain framing

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
                    items.append(dict(text=e['text'], sub=e.get('sub'), t=to, secs=min(e['secs'], b['out0'] + b['L'] - to + 0.25), id='L%03d' % len(items)))
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
    import re
    pk_s = re.split(r'(?<=\.)\s+', VTXT['pk'].strip())
    assert len(pk_s) == len(SLOT_VOICE), pk_s
    voice = [{'t': 0.3, 'text': VTXT['cold']}, {'t': round(CL + 0.3, 3), 'text': VTXT['ctx']}] + \
            [{'t': round(SLOT0 + dt, 3), 'text': tx} for dt, tx in zip(SLOT_VOICE, pk_s)] + \
            [{'t': round(b['out0'] + b['off'], 3), 'text': VTXT[b['id']]} for b in BEATS if b['id'] != 'pk']
    sfx = []
    for ck, _, _ in CLICKS:
        to = out_of(ck)
        if to is not None: sfx.append((round(to, 3), 'click'))
    for b in BEATS:
        for k in b['keys']:
            if k['name'] in SFX_KEY:
                to = out_of(k['t'])
                if to: sfx.append((round(to - 0.3, 3), SFX_KEY[k['name']]))
    if CAMCFG:   # the recorded preview footage is replaced by the user's clip: drop its click sounds, use the clip's own cues
        sfx = [(t, k) for t, k in sfx if not (SLOT0 - 0.01 <= t < SLOT1 + 0.01)]
        sfx += [(round(SLOT0 + t, 3), k) for t, k in CAMCFG.get('sfx', [])]
    for tk in TICKS: sfx.append((round(tk, 3), 'ding'))
    sfx.append((round(CK_T0, 3), 'pop'))
    cams = build_camera()
    kfs = [(out_of(e['t']), crop_for(e)) for e in EV if e['k'] == 'focus' and out_of(e['t']) is not None]
    prev = (960, 540, 1920)
    for to, c in kfs:
        if abs(math.log(c[2] / prev[2])) > 0.28 or math.hypot(c[0] - prev[0], c[1] - prev[1]) > 420: sfx.append((round(to - LEAD, 3), 'whoosh'))
        prev = c
    sfx.append((0.05, 'whoosh')); sfx.append((CL - 0.2, 'whoosh')); sfx.append((CL + CTX - 0.2, 'whoosh'))
    for ft in SKIP_T: sfx.append((round(ft - 0.1, 3), 'whoosh'))
    sfx.sort()
    keep, lastw = [], -9
    for t, k in sfx:
        if k == 'whoosh':
            if t - lastw < 0.9: continue
            lastw = t
        keep.append((t, k))
    P = dict(CL=CL, CTX=CTX, N_CTX=N_CTX, SLOT0=SLOT0, SLOT1=SLOT1, END=END, TOTAL=TOTAL, TICKS=TICKS, voice=voice, sfx=keep, labels=items,
             beats=[dict(id=b['id'], out0=round(b['out0'], 2), L=round(b['L'], 2), off=round(b['off'], 2), natural=round(b['natural'], 2), f=round(b['f'], 2)) for b in BEATS])
    json.dump(P, open('plan.json', 'w'), indent=1)
    lab = [dict(id=i['id'], text=i['text'], sub=i.get('sub')) for i in items]
    lab += [dict(id='title', type='title', text='Cross-border payments, settled in seconds'), dict(id='end', type='end', text=''),
            dict(id='note', type='note', text='passkey sign-up clip goes here', sub=f'{SLOT:.0f} s slot: tap Sign up with passkey, Touch ID, card reads passkey wallet + address')]
    json.dump(lab, open('labels.json', 'w'))
    print('CL', round(CL, 2), 'CTX', round(CTX, 2), 'SLOT', round(SLOT0, 2), '->', round(SLOT1, 2), 'END', round(END, 2), 'TOTAL', round(TOTAL, 2), 'ticks', [round(x, 2) for x in TICKS])
    for b in P['beats']: print(b)
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
    return sm, 1

_CACHE = {'idx': -1, 'im': None, 'ctx': -1, 'cim': None}
def get_frame(idx):
    if _CACHE['idx'] != idx:
        _CACHE['im'] = Image.open(f'{RAW}/{idx:06d}.jpg').convert('RGB'); _CACHE['idx'] = idx
    return _CACHE['im']

def get_ctx(idx):
    if _CACHE['ctx'] != idx:
        _CACHE['cim'] = Image.open(f'ctx/{idx:05d}.jpg').convert('RGB'); _CACHE['ctx'] = idx
    return _CACHE['cim']

def paste_sprite(img, spr, x, y, alpha=1.0):
    if alpha <= 0.01: return
    if alpha < 0.99:
        a = spr.getchannel('A').point(lambda v: int(v * alpha)); spr = spr.copy(); spr.putalpha(a)
    img.paste(spr, (int(x), int(y)), spr)

def render_frame(spec):
    """spec: dict with src_idx | ctx, crop (cx,cy,w), cursor, ripples, hls, sprites, flash"""
    load_sprites()
    if 'ctx' in spec:
        img = get_ctx(spec['ctx']).copy()
    else:
        cx, cy, w = spec['crop']; h = w * 9 / 16
        src = get_frame(spec['src_idx'])
        k = src.width / SW
        box = ((cx - w / 2) * k, (cy - h / 2) * k, (cx + w / 2) * k, (cy + h / 2) * k)
        img = src.resize((W, H), Image.BICUBIC if w < 1500 else Image.LANCZOS, box=box)
        z = W / w
        P = lambda x, y: ((x - (cx - w / 2)) * z, (y - (cy - h / 2)) * z)
        for hl in spec['hls']:   # highlighter swipes (multiply, so ink text stays dark)
            r = hl['rect']; x0, y0 = P(r['x'], r['y'] + r['h'] * 0.38); x1, y1 = P(r['x'] + r['w'], r['y'] + r['h'] + 2)
            x1 = x0 + (x1 - x0) * hl['prog']
            bx = (int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1)))
            if bx[2] > bx[0] and bx[3] > bx[1]:
                reg = img.crop(bx); tint = Image.new('RGB', reg.size, (205, 255, 0))
                img.paste(Image.blend(reg, ImageChops.multiply(reg, tint), 0.85 * hl['alpha']), bx[:2])
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

def ck_name(t):
    if t < CK_T0: return None
    for i, x in enumerate(TICKS):
        if x <= t < x + TICK_DUR:
            k = min(10, int((t - x) / TICK_DUR * 10) + 1); return f'cks{i}_{k}'
    return f'ck{sum(1 for x in TICKS if t >= x + TICK_DUR)}'

def ck_sprite(spec, t):
    n = ck_name(t)
    if n is None: return
    vw, vh = CK_VIS
    sx, sy = CK_BOX[0] - 14, CK_BOX[1] - 14
    sx += int((1 - ease((t - CK_T0) / 0.45)) * 520)
    spec['sprites'].append((n, sx, sy, 1.0))

def spec_for(i, cams, labs, hlsl, preview=True):
    t = i / FPS
    spec = dict(sprites=[], hls=[], ripples=[], flash=0.0, cursor=None)
    src_t = None
    if t < CL:      # cold open: the payment lands
        A = cold_spec()
        src_t = A['src0'] + t
        cx, cy, w = A['crop']; p = ease(t / A['len']); w2 = min(W, w * (1.28 - 0.28 * p))
        h2 = w2 * 9 / 16; spec['crop'] = (min(max(cx, w2 / 2), SW - w2 / 2), min(max(cy, h2 / 2), SH - h2 / 2), w2)
        spec['flash'] = max(0, 1 - t / 0.1) * 0.8
        if t > CL - 1.7:
            sw, sh = SPR_SIZE('title'); sx, sy = slot_xy('bl', sw - 36, sh - 36); sy -= 14
            spec['sprites'].append(('title', sx - 14, sy + (H + 8 - sy) * (1 - ease((t - (CL - 1.7)) / 0.2)), 1.0))
    elif t < CL + CTX:   # context doodle
        spec['ctx'] = min(N_CTX, int((t - CL) * FPS) + 1)
        spec['crop'] = (960, 540, 1920)
        spec['flash'] = max(0, 1 - (t - CL) / 0.12) * 0.8
    else:
        src_t = src_of(t)
        spec['crop'] = tuple(cams[i])
        if t < CL + CTX + 0.12: spec['flash'] = (1 - (t - CL - CTX) / 0.12) * 0.8
        if SLOT1 <= t < SLOT1 + 0.12: spec['flash'] = (1 - (t - SLOT1) / 0.12) * 0.8
        spec['flash'] = max(spec['flash'], max([0] + [max(0, 1 - abs(t - ft) / 0.1) * 0.8 for ft in SKIP_T]))
    if src_t is not None:
        spec['src_idx'] = src_frame_idx(src_t + 0.03)
        cx, cy, w = spec['crop']; z = W / w
        mxm, mym = mouse_at(src_t)
        press = any(0 <= src_t - ck < 0.11 for ck, _, _ in CLICKS)
        spec['cursor'] = (mxm, mym, (1.0 + 0.3 * (z - 1) * 0.8) * (0.86 if press else 1.0))
        for ck, kx, ky in CLICKS:
            d = src_t - ck
            if 0 <= d < 0.65:
                u = d / 0.65; spec['ripples'].append((kx, ky, (14 + 70 * (1 - (1 - u) ** 3)) * (0.8 + 0.2 * z), 1 - u))
        if t >= CL + CTX:
            for hl in hlsl:
                d = t - hl['t']
                if 0 <= d < min(hl['secs'], hl['bend'] - hl['t'] + 0.2):
                    spec['hls'].append(dict(rect=hl['rect'], prog=ease(d / 0.4), alpha=min(1, (hl['secs'] - d) / 0.4) if d > hl['secs'] - 0.4 else 1))
    if t >= CL + CTX:   # labels: opaque, slot chosen in assign_slots (never over the focus rect), quick slide in/out from the screen edge
        for lb in labs:
            if lb['id'] == 'note' and not preview: continue
            d = t - lb['t']
            if 0 <= d < lb['secs'] and 'slot' in lb:
                sw, sh = SPR_SIZE(lb['id']); vw, vh = sw - 36, sh - 36
                sx, sy = slot_xy(lb['slot'], vw, vh); sx -= 14; sy -= 14
                p = min(ease(d / 0.18), ease((lb['secs'] - d) / 0.18))
                off = (H + 8 - sy) if lb['slot'][0] == 'b' else -(sy + sh + 8)
                spec['sprites'].append((lb['id'], sx, sy + off * (1 - p), 1.0))
    ck_sprite(spec, t)
    ec = [e for e in EV if e['k'] == 'endcard']
    if ec:
        te = out_of(ec[0]['t'])
        if te is not None and t >= te + 0.5:
            sw, sh = SPR_SIZE('end'); a = min(1, (t - te - 0.5) / 0.35)
            spec['sprites'].append(('end', (W - sw) / 2, H - 52 - sh + 24 * (1 - ease((t - te - 0.5) / 0.4)), a))
    return spec

SKIP_T = [out_of(a) for b in BEATS for a, c, k in b['segs'] if k == 'skip']
def slot_xy(slot, vw, vh):
    x = 48 if slot[1] == 'l' else W - 48 - vw
    y = H - 48 - vh if slot[0] == 'b' else 100
    return x, y

def assign_slots(labs, cams):
    """pick, per label, the corner slot with zero intersection with the focus rect (all sampled moments of its life); ties -> least ink.
    Slots: bottom-left, bottom-right, top-left (top-right belongs to the checklist)."""
    load_sprites(); report = []; placed = []
    for lb in labs:   # appear once the camera move has settled, leave before the next one starts
        if lb['id'] == 'note':
            lb['t'], lb['secs'] = SLOT0 + 0.3, SLOT - 0.6
        else:
            prev = [k for k in KF_INFO if k[0] <= lb['t'] + 0.05]; nxt = [k for k in KF_INFO if k[0] > lb['t'] + 0.05]
            t0_ = max(lb['t'], prev[-1][0] + prev[-1][1] * 0.9) if prev else lb['t']
            t1_ = min(lb['t'] + lb['secs'], nxt[0][0] - 0.08) if nxt else lb['t'] + lb['secs']
            lb['t'], lb['secs'] = t0_, max(0.9, t1_ - t0_)
        sw, sh = SPR_SIZE(lb['id']); vw, vh = sw - 36, sh - 36
        times = [lb['t'] + k * 0.15 for k in range(int(lb['secs'] / 0.15) + 1) if lb['t'] + k * 0.15 < TOTAL]
        score = {}
        for slot in ('bl', 'br', 'tl'):
            x, y = slot_xy(slot, vw, vh); box = (x - 12, y - 12, x + vw + 12, y + vh + 12); ov = 0
            for tt in times:
                i = min(int(tt * FPS), len(cams) - 1); cx, cy, w = cams[i]; z = W / w
                foc = focus_at(src_of(max(tt, CL + CTX)) or 0)
                if foc and not foc.get('wide'):
                    ov = max(ov, overlap(box, screen_box(eff_rect(foc), (cx, cy, w))))
            tm = times[len(times) // 2]; i = min(int(tm * FPS), len(cams) - 1); cx, cy, w = cams[i]
            fr = get_frame(src_frame_idx((src_of(max(tm, CL + CTX)) or 0) + 0.03)); k = fr.width / SW
            crop = fr.resize((480, 270), Image.BILINEAR, box=((cx - w / 2) * k, (cy - w * 9 / 32) * k, (cx + w / 2) * k, (cy + w * 9 / 32) * k)).convert('L')
            a = np.asarray(crop.crop((int(x / 4), int(y / 4), int((x + vw) / 4), int((y + vh) / 4))))
            score[slot] = (ov, float((a < 110).mean()))
        busy = {sl for sl, a0, a1 in placed if a0 < lb['t'] + lb['secs'] + 0.1 and lb['t'] < a1 + 0.1}   # a slot still showing another label
        best = min(score, key=lambda k: (k in busy, score[k][0] > 0, score[k][0] if score[k][0] > 0 else 0, score[k][1] + (0.0 if k[0] == 'b' else 0.01)))
        placed.append((best, lb['t'], lb['t'] + lb['secs']))
        lb['slot'] = best; report.append((lb['text'], round(lb['t'], 2), best, round(score[best][0]), round(score[best][1], 3)))
    return report

def SPR_SIZE(k): load_sprites(); return SPR[k].size

def audit(cams, labs):
    """geometry audit over the main timeline: focus rect vs checklist and vs labels, per frame (settled camera = 0.5 s after each keyframe)."""
    bad_ck, bad_lb, n = [], [], 0
    iv = [(k[0], k[0] + k[1] + 0.05) for k in KF_INFO]
    for i in range(int((CL + CTX) * FPS), min(len(cams), int(TOTAL * FPS))):
        t = i / FPS; s = src_of(t)
        foc = focus_at(s or 0)
        if not foc or foc.get('wide'): continue
        cam = tuple(cams[i]); fb = screen_box(eff_rect(foc), cam)
        settled = not any(a <= t < b for a, b in iv)
        n += 1
        if overlap(fb, CK_BOX) > 0: bad_ck.append((round(t, 2), round(overlap(fb, CK_BOX)), settled))
        for lb in labs:
            if lb['id'] == 'note' or 'slot' not in lb: continue
            if lb['t'] + 0.25 <= t < lb['t'] + lb['secs'] - 0.25:
                sw, sh = SPR_SIZE(lb['id']); x, y = slot_xy(lb['slot'], sw - 36, sh - 36)
                o = overlap(fb, (x, y, x + sw - 36, y + sh - 36))
                if o > 0: bad_lb.append((round(t, 2), lb['text'], round(o), settled))
    return n, bad_ck, bad_lb

# ---------------- worker pool ----------------
def work(args):
    lo, hi, cams, labs, hlsl, preview = args
    return [render_frame(spec_for(i, cams, labs, hlsl, preview)).tobytes() for i in range(lo, hi)]

def render(t0, t1, out, preview=True):
    import multiprocessing as mp
    import imageio_ffmpeg
    P = plan()
    load_sprites()
    cams = build_camera(); labs = P['labels']; _, hlsl = overlay_items()
    labs.append(dict(id='note', text='note', t=SLOT0 + 0.3, secs=SLOT - 0.6))
    rep_ = assign_slots(labs, cams)
    json.dump(rep_, open('label_slots.json', 'w'), indent=0)
    lo, hi = int(round(t0 * FPS)), int(round(t1 * FPS))
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-g', '30', '-an', '-movflags', '+faststart', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    CH = 10
    jobs = [(a, min(hi, a + CH), cams, labs, hlsl, preview) for a in range(lo, hi, CH)]
    with mp.get_context('fork').Pool(max(2, (os.cpu_count() or 4) - 1)) as pool:
        for k, chunk in enumerate(pool.imap(work, jobs)):
            for fb in chunk: proc.stdin.write(fb)
            if k % 20 == 0: print(out, 'frames', jobs[k][1], '/', hi, flush=True)
    proc.stdin.close(); proc.wait()
    print('wrote', out, hi - lo, 'frames')

def parts(preview=False):
    os.makedirs('parts', exist_ok=True)
    render(0, SLOT0, 'parts/A.mp4', True)
    if preview: render(SLOT0, SLOT1, 'parts/B_preview.mp4', True)
    render(SLOT1, TOTAL, 'parts/C.mp4', True)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'plan':
        plan()
        if os.path.exists('ov/sizes.json'):
            P = json.load(open('plan.json')); cams = build_camera(); labs = P['labels']
            for lb in labs: pass
            rep_ = assign_slots(labs, cams)
            for r_ in rep_: print('label', r_)
            n, bck, blb = audit(cams, labs)
            print('audit frames', n, 'checklist overlaps', len(bck), 'label overlaps', len(blb))
            print('  ck', bck[:12]); print('  lb', blb[:12])
    elif cmd == 'parts': parts(preview='preview' in sys.argv[2:])
    elif cmd == 'render':
        a = [float(x) for x in sys.argv[2:4]]
        render(a[0], a[1], 'preview_range.mp4')
