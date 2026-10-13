"""Contact sheet of raw frames: python peek.py RAWDIR out.png t1 t2 ... (seconds since 'start')"""
import json, sys, bisect
from PIL import Image
raw, out, ts = sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3:]]
d = json.load(open(f'{raw}/events.json')); t0 = next(e['t'] for e in d['ev'] if e['k'] == 'start'); fr = json.load(open(f'{raw}/frames.json'))
ims = []
for t in ts:
    i = max(0, bisect.bisect_right(fr, t0 + t) - 1)
    im = Image.open(f'{raw}/{i:06d}.jpg').convert('RGB'); im = im.crop((0, 0, im.width, min(im.height, 1080))).resize((960, 540)); ims.append(im)
W = Image.new('RGB', (960 * 2, 540 * ((len(ims) + 1) // 2)))
for k, im in enumerate(ims): W.paste(im, ((k % 2) * 960, (k // 2) * 540))
W.save(out)
