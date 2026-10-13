"""Assemble the final video: parts/A.mp4 + the passkey slot + parts/C.mp4, with final.wav.
  python splice.py                      # uses passkey.mov when it exists -> hisab-agora.mp4 (FINAL); otherwise -> hisab-agora-preview.mp4 (placeholder)
  python splice.py --clip other.mov     # splice another clip (uses passkey_cam.json if it fits that clip, else --auto)
  python splice.py --auto               # generic fit: clip trimmed / sped / slowed to the slot, generic camera (wide, punch-in, wide, punch-in)
  python splice.py --preview            # force the placeholder preview even when passkey.mov exists
Prerequisites (run once, from demo/agora): compose.py plan, node overlays.mjs, node ctx.mjs, audio.py, compose.py parts [preview]
The slot is SLOT seconds long (18.0): the clip is retimed by passkey_cam.json 'warp' (never sped up around the Touch ID sheet), framed by the
virtual camera ('cam', same ease / creep / punch moves as the rest of the video, never under the checklist) and gets lime swipes ('hl').
"""
import argparse, glob, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageChops
import imageio_ffmpeg
import compose as C

FPS, W, H = C.FPS, C.W, C.H
FF = imageio_ffmpeg.get_ffmpeg_exe()
PAPER = (240, 237, 232)
ap = argparse.ArgumentParser()
ap.add_argument('--clip', default='passkey.mov'); ap.add_argument('--cam', default='passkey_cam.json')
ap.add_argument('--auto', action='store_true'); ap.add_argument('--preview', action='store_true'); ap.add_argument('--out')
args = ap.parse_args()
CLIP_OK = os.path.exists(args.clip) and not args.preview
SLOT = C.SLOT

def probe(path):
    r = subprocess.run([FF, '-i', path], capture_output=True, text=True).stderr
    dur = r.split('Duration:')[1].split(',')[0].strip(); h, m, s = dur.split(':'); dur = int(h) * 3600 + int(m) * 60 + float(s)
    wh = [t for t in r.split() if 'x' in t and t.replace('x', '').replace(',', '').isdigit() and len(t) > 6][0].rstrip(',')
    return dur, int(wh.split('x')[0]), int(wh.split('x')[1])

def auto_cfg(dur, cw, ch):
    """generic fit when there is no tuned config: units = clip px"""
    cut = 0.5
    s = min(1.6, max(0.6, dur / (SLOT - cut - 1.0)))
    end = cut + dur / s
    warp = [[0, 0], [cut, 0], [min(end, SLOT), min(dur, (SLOT - cut) * s)], [SLOT, min(dur, (SLOT - cut) * s)]]
    return dict(unit_px=1.0, view=[0, 0, cw, ch], slot=SLOT, tick=0.78 * SLOT, warp=warp, hl=[], focus=[], punch=[], sfx=[],
                cam=[[0, cw / 2, ch / 2, cw, 0.1], [0.22 * SLOT, cw / 2, ch * 0.5, cw * 0.62, 0.9], [0.5 * SLOT, cw / 2, ch / 2, cw * 0.95, 0.9], [0.74 * SLOT, cw * 0.5, ch * 0.3, cw * 0.55, 0.9]])

def warp_at(warp, t):
    if t <= warp[0][0]: return warp[0][1]
    for (t0, c0), (t1, c1) in zip(warp, warp[1:]):
        if t <= t1: return c0 + (c1 - c0) * ((t - t0) / (t1 - t0) if t1 > t0 else 1)
    return warp[-1][1]

def build_cam(cfg, n):
    kfs = sorted(cfg['cam'], key=lambda k: k[0])
    vx0, vy0, vx1, vy1 = cfg['view']
    cur = (kfs[0][1], kfs[0][2], kfs[0][3]); tr = None; ki = 0; settle = 0.0; out = []
    punches = [(p[0] - 0.25, p[1]) for p in cfg.get('punch', [])]
    for i in range(n):
        t = i / FPS
        while ki < len(kfs) and kfs[ki][0] <= t:
            tt, cx, cy, w, dur = kfs[ki]; tr = (tt, cur, (cx, cy, w), dur); settle = tt + dur; ki += 1
        if tr:
            tt, a, b, dur = tr; u = C.ease((t - tt) / max(dur, 1e-6))
            cx = a[0] + (b[0] - a[0]) * u; cy = a[1] + (b[1] - a[1]) * u
            w = math.exp(math.log(a[2]) + (math.log(b[2]) - math.log(a[2])) * u)
        else: cx, cy, w = cur
        cur = (cx, cy, w)
        wd = w * (1 - 0.035 * C.ease((t - settle) / 3.5) if tr and w < (vx1 - vx0) * 0.92 else 1)
        for pt, amp in punches:
            d = t - pt
            if 0 <= d < 1.4: wd *= 1 - amp * (math.sin(min(d / 0.12, 1) * math.pi / 2) * math.exp(-max(0, d - 0.12) / 0.38))
        dx = 0.005 * wd * math.sin(0.9 * t + 1.1); dy = 0.004 * wd * math.cos(0.7 * t)
        out.append((cx + dx, cy + dy, wd))
    return out

def crop_resize(src, box, unit_px, out_size=(W, H)):
    """box in unit coordinates (x0,y0,x1,y1); areas outside the clip frame are paper-coloured (never black bars)"""
    x0, y0, x1, y1 = [v * unit_px for v in box]
    sw, sh = src.size
    if x0 >= 0 and y0 >= 0 and x1 <= sw and y1 <= sh:
        return src.resize(out_size, Image.BICUBIC if (x1 - x0) < 1500 else Image.LANCZOS, box=(x0, y0, x1, y1))
    cv = Image.new('RGB', (int(round(x1 - x0)), int(round(y1 - y0))), PAPER)
    ix0, iy0, ix1, iy1 = max(0, x0), max(0, y0), min(sw, x1), min(sh, y1)
    if ix1 > ix0 and iy1 > iy0: cv.paste(src.crop((int(ix0), int(iy0), int(ix1), int(iy1))), (int(ix0 - x0), int(iy0 - y0)))
    return cv.resize(out_size, Image.LANCZOS)

# ---- clip frames (constant 30 fps, native resolution) ----
def extract(clip):
    d = 'slot'; os.makedirs(d, exist_ok=True)
    stamp = f'{d}/.src'; sig = f'{clip}:{os.path.getmtime(clip)}'
    if not (os.path.exists(stamp) and open(stamp).read() == sig and glob.glob(f'{d}/c_*.jpg')):
        for f in glob.glob(f'{d}/c_*.jpg'): os.remove(f)
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', clip, '-vf', f'fps={FPS}', '-q:v', '3', f'{d}/c_%04d.jpg'], check=True)
        open(stamp, 'w').write(sig)
    return len(glob.glob(f'{d}/c_*.jpg'))

CFG = None; NCLIP = 0; CAM = None
def frame_blend(ct, nclip):
    fa = min(nclip - 1, max(0, int(math.floor(ct * FPS)))); fb = min(nclip - 1, fa + 1); fr = ct * FPS - math.floor(ct * FPS)
    return fa, fb, (fr if fa != fb else 0.0)

_cache = {}
def getimg(n):
    if n not in _cache:
        if len(_cache) > 6: _cache.pop(next(iter(_cache)))
        _cache[n] = Image.open(f'slot/c_{n + 1:04d}.jpg').convert('RGB')
    return _cache[n]

def slot_frame(i):
    t = i / FPS; cfg = CFG; up = cfg['unit_px']
    ct = warp_at(cfg['warp'], t)
    fa, fb, fr = frame_blend(ct, NCLIP)
    cx, cy, w = CAM[i]; h = w * 9 / 16
    vx0, vy0, vx1, vy1 = cfg['view']
    cx = min(max(cx, vx0 + w / 2), vx1 - w / 2) if w < vx1 - vx0 else (vx0 + vx1) / 2
    cy = min(max(cy, vy0 + h / 2), vy1 - h / 2) if h < vy1 - vy0 else (vy0 + vy1) / 2
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    img = crop_resize(getimg(fa), box, up)
    if fr > 0.02: img = Image.blend(img, crop_resize(getimg(fb), box, up), fr)
    z = W / w; P = lambda x, y: ((x - box[0]) * z, (y - box[1]) * z)
    for (ht, secs, hx, hy, hw, hh) in cfg.get('hl', []):
        d = t - ht
        if 0 <= d < secs:
            prog = C.ease(d / 0.4); alpha = min(1, (secs - d) / 0.4) if d > secs - 0.4 else 1
            x0, y0 = P(hx, hy + hh * 0.38); x1, y1 = P(hx + hw, hy + hh + 2); x1 = x0 + (x1 - x0) * prog
            bx = (int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1)))
            if bx[2] > bx[0] and bx[3] > bx[1]:
                reg = img.crop(bx); tint = Image.new('RGB', reg.size, (205, 255, 0))
                img.paste(Image.blend(reg, ImageChops.multiply(reg, tint), 0.85 * alpha), bx[:2])
    spec = dict(sprites=[]); C.load_sprites(); C.ck_sprite(spec, C.SLOT0 + t)
    for (name, x, y, a) in spec['sprites']: C.paste_sprite(img, C.SPR[name], x, y, a)
    if t < 0.12: img = Image.blend(img, Image.new('RGB', (W, H), (200, 255, 0)), (1 - t / 0.12) * 0.8)
    return img

def work(rng):
    return [slot_frame(i).tobytes() for i in range(*rng)]

def render_slot(out):
    import multiprocessing as mp
    n = int(round(SLOT * FPS))
    cmd = [FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-g', '30', '-an', '-movflags', '+faststart', out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    jobs = [(a, min(n, a + 10)) for a in range(0, n, 10)]
    with mp.get_context('fork').Pool(max(2, (os.cpu_count() or 4) - 1)) as pool:
        for chunk in pool.imap(work, jobs):
            for fb in chunk: proc.stdin.write(fb)
    proc.stdin.close(); proc.wait()
    print('wrote', out, n, 'frames')

def check_focus(cfg):
    """camera keyframes vs the checklist: the focus rects must stay clear of it once settled"""
    bad = 0
    for k in cfg.get('cam', []):
        t = k[0]
        for f in cfg.get('focus', []):
            if abs(f[0] - t) < 1e-6:
                cx, cy, w = k[1], k[2], k[3]; h = w * 9 / 16; z = W / w
                bx = ((f[1] - (cx - w / 2)) * z, (f[2] - (cy - h / 2)) * z, (f[1] + f[3] - (cx - w / 2)) * z, (f[2] + f[4] - (cy - h / 2)) * z)
                o = C.overlap(bx, C.CK_BOX)
                print('  focus@%.1fs screen box %s vs checklist %s -> overlap %d px2' % (t, [round(v) for v in bx], [round(v) for v in C.CK_BOX], o)); bad += o > 0
    return bad

def assemble(a, b, c, out):
    lst = 'parts/concat.txt'
    open(lst, 'w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in (a, b, c)))
    subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', 'final.wav', '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], check=True)
    print('wrote', out)

if __name__ == '__main__':
    os.makedirs('parts', exist_ok=True)
    for need in ('parts/A.mp4', 'parts/C.mp4', 'final.wav'):
        if not os.path.exists(need): sys.exit(f'missing {need}: run compose.py parts and audio.py first')
    if CLIP_OK:
        dur, cw, ch = probe(args.clip)
        CFG = json.load(open(args.cam)) if (os.path.exists(args.cam) and not args.auto and args.clip == 'passkey.mov') else auto_cfg(dur, cw / 1.0, ch / 1.0)
        print('clip', args.clip, round(dur, 2), 's', cw, 'x', ch, '| config:', 'tuned ' + args.cam if CFG.get('unit_px') == 2.0 else 'auto')
        NCLIP = extract(args.clip)
        CAM = build_cam(CFG, int(round(SLOT * FPS)))
        bad = check_focus(CFG)
        if bad: print('WARNING: camera keyframes overlap the checklist', bad)
        render_slot('parts/B_user.mp4')
        assemble('parts/A.mp4', 'parts/B_user.mp4', 'parts/C.mp4', args.out or 'hisab-agora.mp4')
    else:
        if not os.path.exists('parts/B_preview.mp4'): sys.exit('no clip and no parts/B_preview.mp4: run compose.py parts preview')
        assemble('parts/A.mp4', 'parts/B_preview.mp4', 'parts/C.mp4', args.out or 'hisab-agora-preview.mp4')
