"""narration + synthesised music bed + sfx -> final.wav (voice dominant; music sidechain-ducked)."""
import json, subprocess, sys, numpy as np, soundfile as sf, imageio_ffmpeg
from scipy.signal import butter, lfilter
SR = 48000
P = json.load(open('plan.json')); TOTAL = P['TOTAL']
NARR = '/Users/mac/.claude/plugins/cache/brag-scaled/brag-scaled/0.7.0-scaled/skills/narrate/scripts/narrate.py'
ff = imageio_ffmpeg.get_ffmpeg_exe()
rng = np.random.default_rng(7)
def lp(x, f, o=2): b, a = butter(o, f / (SR / 2)); return lfilter(b, a, x)
def bp(x, lo, hi): b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)
def env(n, a, d): t = np.arange(n) / SR; return np.minimum(t / a, 1) * np.exp(-t / d)

def sfx(kind):
    if kind == 'click':
        n = int(.06 * SR); t = np.arange(n) / SR
        return (bp(rng.standard_normal(n), 1500, 6000) * env(n, .001, .008) * .8 + np.sin(2 * np.pi * 1800 * t) * env(n, .0005, .012) * .5) * 0.9
    if kind == 'pop':
        n = int(.12 * SR); t = np.arange(n) / SR; return np.sin(2 * np.pi * (500 + 300 * np.exp(-t * 30)) * t) * env(n, .002, .04)
    if kind == 'ding':
        n = int(1.0 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 1318.5 * t) + .5 * np.sin(2 * np.pi * 1975.5 * t) + .25 * np.sin(2 * np.pi * 2637 * t)) * env(n, .002, .25) * .6
    if kind == 'thud':
        n = int(.5 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * (48 + 70 * np.exp(-t * 25)) * t) * env(n, .001, .13) * 1.2 + lp(rng.standard_normal(n), 900) * env(n, .001, .03) * .6)
    if kind == 'whoosh':
        n = int(.55 * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
        fc = 400 + 3500 * np.sin(np.pi * t / .55) ** 2; out = np.zeros(n)
        for i in range(0, n, 512):
            f = fc[i]; seg = bp(x[i:i + 512 + 256], max(200, f * .6), min(9000, f * 1.4)); out[i:i + 512] = seg[:len(out[i:i + 512])]
        return out * np.sin(np.pi * t / .55) ** 2 * .9
sfx_track = np.zeros(int((TOTAL + 2) * SR))
GAIN = {'click': .40, 'pop': .30, 'ding': .32, 'thud': .60, 'whoosh': .25}
for t, k in P['sfx']:
    s = sfx(k) * GAIN[k]; i = int(max(0, t) * SR); sfx_track[i:i + len(s)] += s[:len(sfx_track) - i]

# music: C Am F G, 100 BPM, pad + pluck + soft sub
BPM = 100; beat = 60 / BPM; bar = 4 * beat
chords = [([48, 52, 55, 60], 36), ([45, 52, 57, 60], 33), ([41, 48, 53, 57], 29), ([43, 50, 55, 59], 31)]
mf = lambda m: 440 * 2 ** ((m - 69) / 12)
n = len(sfx_track); mus = np.zeros(n); t_all = np.arange(n) / SR
nb = int(TOTAL / bar) + 2
for b in range(nb):
    notes, root = chords[b % 4]; i0 = int(b * bar * SR); L = int(bar * SR)
    if i0 >= n: break
    L = min(L, n - i0); t = np.arange(L) / SR
    pad = sum(np.sin(2 * np.pi * mf(m) * (1 + d) * t) for m in notes for d in (-.003, .003)) / 8
    pad *= np.minimum(t / .6, 1) * np.minimum((bar - t) / .6, 1) * .5
    sub = np.sin(2 * np.pi * mf(root) * t) * np.minimum(t / .05, 1) * np.exp(-t / 1.2) * .6
    mus[i0:i0 + L] += pad + sub
    arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[2] + 12, notes[1] + 12, notes[3] + 24, notes[2] + 12]
    for k, m in enumerate(arp):
        j = int((b * bar + k * beat / 2) * SR); 
        if j >= n: break
        nn = int(.7 * SR); tt = np.arange(nn) / SR
        pl = (np.sin(2 * np.pi * mf(m) * tt) + .3 * np.sin(2 * np.pi * mf(m) * 2 * tt)) * env(nn, .003, .18) * .35
        mus[j:j + nn] += pl[:max(0, min(nn, n - j))]
mus = lp(mus, 5000, 2); mus *= 0.25 / np.abs(mus).max()
fade = np.minimum(1, (TOTAL + 0.3 - t_all) / 1.5).clip(0, 1); mus *= fade
sf.write('score.wav', mus.astype('float32'), SR)
sf.write('sfx.wav', sfx_track.astype('float32'), SR)

json.dump(P['voice'], open('script.json', 'w'))
subprocess.run([sys.executable, NARR, 'script.json', '--voice', 'af_heart', '--speed', '1.08', '--out', 'narration.wav', '--timings', 'timings-final.json', '--music', 'score.wav', '--mix', 'mix.wav'], check=True)
mix, sr = sf.read('mix.wav', dtype='float32'); assert sr == SR
sx = np.stack([sfx_track[:len(mix)]] * 2, 1); sx = np.pad(sx, ((0, max(0, len(mix) - len(sx))), (0, 0)))
out = mix.copy(); out[:len(sx)] += sx[:len(out)] * 0.5
out = out[: int(TOTAL * SR)]
pk = np.abs(out).max(); out *= min(1, 0.92 / pk)
sf.write('final.wav', out, SR)
# levels: voice vs ducked music
v, vsr = sf.read('narration.wav', dtype='float32')
t = json.load(open('timings-final.json'))
def rms(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
vs = np.concatenate([v[int(l['t'] * vsr):int(l['end'] * vsr)] for l in t])
graph = "[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.4,asplit=2[vx][sc0];[vx]anullsink;[sc0]apad[sc];[0:a]aresample=48000,aformat=channel_layouts=stereo[m];[m][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[duck]"
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', 'score.wav', '-i', 'narration.wav', '-filter_complex', graph, '-map', '[duck]', 'duck.wav'], check=True)
d, _ = sf.read('duck.wav', dtype='float32')
mask = np.zeros(len(d), bool)
for l in t: mask[int(l['t'] * SR):int(l['end'] * SR)] = True
print('voice rms dB (speech, x1.4):', round(rms(vs) + 20 * np.log10(1.4), 1), ' music-ducked rms dB during speech:', round(rms(d[mask]), 1), ' sfx peak dBFS:', round(20 * np.log10(np.abs(sx * .5).max()), 1), ' final peak', round(20 * np.log10(np.abs(out).max()), 1))
