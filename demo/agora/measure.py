"""Measure narration.json line durations (sequential t, cached synth) -> timings.json. Usage: python measure.py"""
import json, subprocess, sys, os
NARR = '/Users/mac/.claude/plugins/cache/brag-scaled/brag-scaled/0.8.0-scaled/skills/narrate/scripts/narrate.py'
n = json.load(open('narration.json'))
json.dump([{'t': 25 * i, 'text': x['text']} for i, x in enumerate(n)], open('measure.json', 'w'))
subprocess.run([sys.executable, NARR, 'measure.json', '--voice', 'af_heart', '--speed', '1.05', '--out', 'measure.wav', '--timings', 'measure_timings.json'], check=True, stderr=subprocess.DEVNULL)
os.remove('measure.wav')
t = json.load(open('measure_timings.json'))
json.dump([{'t': 0, 'end': b['dur'], 'dur': b['dur'], 'text': b['text']} for b in t], open('timings.json', 'w'), indent=1)
for a, b in zip(n, t): print(a['id'].ljust(7), len(a['text'].split()), round(b['dur'], 2))
print('sum', round(sum(b['dur'] for b in t), 1))
