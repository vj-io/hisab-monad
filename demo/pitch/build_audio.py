"""Pitch narration: two voices (narrate.py, Kokoro) -> layout on one timeline -> per-speaker
lip-sync envelopes -> voice.wav. Run with ~/.claude/brag-scaled-venv/bin/python.
  1. synth every line once to measure it   2. place lines (gaps, chapter pauses)   3. re-run narrate.py with final t
  4. merge the two speakers (equal loudness) and write layout.js (LINES + ENV_V/ENV_B at 100 Hz)."""
import json, subprocess, sys, pathlib, numpy as np, soundfile as sf
HERE = pathlib.Path(__file__).parent
NARR = '/Users/mac/.claude/plugins/cache/brag-scaled/brag-scaled/0.7.0-scaled/skills/narrate/scripts/narrate.py'
VOICE = {'V': ('am_michael', 1.05), 'B': ('am_liam', 0.93)}
GAP, GAP_SAME, GAP_CH, LEAD, TAIL = 0.34, 0.28, 1.15, 0.7, 4.2
SR = 24000
S = json.load(open(HERE / 'script.json'))
W = HERE / 'work'; W.mkdir(exist_ok=True)

def run_narr(who, items, tag):
    sj = W / f'{tag}_{who}.json'; sj.write_text(json.dumps(items))
    v, sp = VOICE[who]
    out = W / f'{tag}_{who}.wav'; tim = W / f'{tag}_{who}_timings.json'
    subprocess.run([sys.executable, NARR, str(sj), '--voice', v, '--speed', str(sp), '--out', str(out), '--timings', str(tim)], check=True)
    return out, json.load(open(tim))

# 1. measure
dur = {}
for who in 'VB':
    items = [{'t': 12 * i, 'text': l.get('tts', l['text'])} for i, l in enumerate(x for x in S if who in x['who'])]
    _, tm = run_narr(who, items, 'm')
    for l, t in zip([x for x in S if who in x['who']], tm): dur[(l['id'], who)] = t['dur']
# 2. place
t = LEAD; prev = None; placed = []
for l in S:
    d = max(dur[(l['id'], w)] for w in l['who'])
    gap = 0 if prev is None else (GAP_CH if l['ch'] != prev['ch'] else GAP_SAME if l['who'] == prev['who'] else GAP)
    t0 = t + gap if prev else t
    placed.append(dict(l, t=round(t0, 3), end=round(t0 + d, 3)))
    t = t0 + d; prev = l
END = placed[-1]['end'] + TAIL
# 3. final narration per speaker
tracks = {}
for who in 'VB':
    items = [{'t': l['t'], 'text': l.get('tts', l['text'])} for l in placed if who in l['who']]
    out, tm = run_narr(who, items, 'f')
    x, sr = sf.read(out, dtype='float32'); assert sr == SR
    x = np.pad(x, (0, max(0, int(END * SR) - len(x))))
    tracks[who] = x
# 4. equal loudness (speech RMS), merge, envelopes
def speech_rms(x):
    a = x[np.abs(x) > 0.02]; return float(np.sqrt(np.mean(a ** 2)))
tgt = 0.075
for who in 'VB': tracks[who] = tracks[who] * (tgt / speech_rms(tracks[who]))
mix = tracks['V'] + tracks['B']; pk = np.abs(mix).max()
if pk > 0.89: k = 0.89 / pk; tracks = {w: x * k for w, x in tracks.items()}; mix *= k
sf.write(HERE / 'voice.wav', mix, SR); sf.write(W / 'voice_V.wav', tracks['V'], SR); sf.write(W / 'voice_B.wav', tracks['B'], SR)
def env(x, hz=100):
    hop = SR // hz; win = int(.03 * SR); n = len(x) // hop
    r = np.array([np.sqrt(np.mean(x[i * hop: i * hop + win] ** 2)) if i * hop + win <= len(x) else 0 for i in range(n)])
    r = r / (np.percentile(r[r > 0.004], 95) if (r > 0.004).any() else 1)
    return np.clip(np.round(r * 99), 0, 99).astype(int).tolist()
ev, eb = env(tracks['V']), env(tracks['B'])
lines = [{k: l[k] for k in ('id', 'who', 'ch', 'text', 't', 'end')} for l in placed]
(HERE / 'layout.js').write_text(
    'window.LINES=' + json.dumps(lines) + ';\nwindow.END=' + f'{END:.3f}' + ';\nwindow.ENV_V=' + json.dumps(ev, separators=(',', ':')) +
    ';\nwindow.ENV_B=' + json.dumps(eb, separators=(',', ':')) + ';\n')
json.dump(lines, open(HERE / 'timings.json', 'w'), indent=1)
spk = {w: round(sum(l['end'] - l['t'] for l in placed if w in l['who']), 2) for w in 'VB'}
wc = {w: sum(len(l['text'].replace('A U S D', 'AUSD').split()) for l in placed if w in l['who']) for w in 'VB'}
print('END', round(END, 2), 'speaking secs', spk, 'words', wc)
for l in placed: print(l['id'], l['who'], l['t'], l['end'])
