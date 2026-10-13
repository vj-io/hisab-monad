"""score (soundkit: pencil/pop/stamp cues + a soft lo-fi bed) -> ducked under the two voices with narrate.py's own sidechain graph -> final.wav"""
import subprocess, sys, pathlib, json
import imageio_ffmpeg
H = pathlib.Path(__file__).parent
SK = '/Users/mac/.claude/plugins/cache/brag-scaled/brag-scaled/0.7.0-scaled/skills/motion-kit/scripts/soundkit.py'
ff = imageio_ffmpeg.get_ffmpeg_exe()
first = json.load(open(H / 'timings.json'))[0]['t']
subprocess.run([sys.executable, SK, str(H / 'sfx.json'), '--out', str(H / 'score.wav'), '--bed', 'boombap', '--bpm', '100', '--t0', f'{first}', '--tail', '4.0', '--peak', '-23'], check=True)
# identical to narrate.py's --music/--mix graph (voice = both speakers summed): music ducked under the voice, brought back between lines
graph = ("[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.4,asplit=2[v][sc0];"
         "[sc0]apad[sc];"
         "[0:a]aresample=48000,aformat=channel_layouts=stereo[m];"
         "[m][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[duck];"
         "[duck][v]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95")
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(H / 'score.wav'), '-i', str(H / 'voice.wav'), '-filter_complex', graph, str(H / 'final.wav')], check=True)
print('final.wav written')
