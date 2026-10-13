"""Activity audit (motion-kit): samples the video 4x per second and reports how much of the picture changes.
python activity.py video.mp4  -> median activity, share of quiet time (<1% of pixels changing) and every quiet stretch >= 1.5 s"""
import subprocess, sys, numpy as np, imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe(); f = sys.argv[1]
w, h = 480, 270
p = subprocess.Popen([ff, '-loglevel', 'error', '-i', f, '-vf', f'fps=4,scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
prev, act = None, []
while True:
    b = p.stdout.read(w * h)
    if len(b) < w * h: break
    a = np.frombuffer(b, np.uint8).astype(np.int16)
    if prev is not None: act.append(float((np.abs(a - prev) > 12).mean()))
    prev = a
act = np.array(act); t = (np.arange(len(act)) + 1) / 4
quiet = act < 0.01
print('samples', len(act), 'median activity %.3f' % np.median(act), 'quiet %.0f%%' % (100 * quiet.mean()))
i = 0
while i < len(act):
    if quiet[i]:
        j = i
        while j < len(act) and quiet[j]: j += 1
        if (j - i) / 4 >= 1.5: print('quiet %.2f-%.2f s (%.2f s)' % (t[i] - .25, t[j - 1], (j - i) / 4))
        i = j
    else: i += 1
