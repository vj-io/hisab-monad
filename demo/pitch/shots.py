"""Crop the real product stills out of the live run (demo/zoom/raw_run3, 1920x1080 frames; the 4K claim does not hold,
so each crop is Lanczos-upscaled 2x with a light unsharp mask). Outputs assets/shots/*.png, plus work copies of the photos."""
import pathlib
from PIL import Image, ImageFilter
H = pathlib.Path(__file__).parent
RAW = H.parent / 'zoom' / 'raw_run3'
SHOTS = {  # name: (frame, (x, y, w, h)) in source px
    'ack':      (655,  (560, 538, 800, 250)),   # buyer signs (EIP-712): Acknowledge + "Acknowledged at block"
    'offer':    (345,  (455, 440, 1010, 320)),  # Advance offer 39,000.00, 80% of 48,750.00 at 12.5% APR
    'locked':   (844,  (455, 545, 1010, 345)),  # Financed advance + ALREADY_LOCKED
    'paid':     (1053, (590, 735, 740, 225)),   # PAID waterfall 40,001.71 / 26.24 / 8,722.04
    'tier2':    (1139, (455, 395, 1010, 480)),  # Tier 2 exporter, 88% / 11.5%
    'explorer': (1498, (585, 585, 755, 395)),   # Registered > Acknowledged > Financed > Paid
    'console':  (296,  (440, 0, 1040, 600)),    # the live console header + wallets + invoice
}
for n, (f, (x, y, w, h)) in SHOTS.items():
    im = Image.open(RAW / f'{f:06d}.jpg').convert('RGB').crop((x, y, x + w, y + h))
    im = im.resize((w * 2, h * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.4, percent=60, threshold=2))
    im.save(H / 'assets' / 'shots' / f'{n}.png'); print(n, im.size)
ph = H / 'assets' / 'photos'
v = Image.open(ph / 'vaibhav.jpg'); v.thumbnail((2000, 2000), Image.LANCZOS); v.save(ph / 'vaibhav_w.jpg', quality=92)
print('vaibhav_w', v.size)
