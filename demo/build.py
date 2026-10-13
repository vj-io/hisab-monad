"""Fit narration to the recorded beat times and mux the final mp4.
Usage: .venv/bin/python build.py   (after node record.mjs; needs beats.json, video-path.txt)"""
import json, pathlib, subprocess, sys
import imageio_ffmpeg
NARRATE = pathlib.Path.home() / ".claude/plugins/cache/brag-scaled/brag-scaled/0.7.0-scaled/skills/narrate/scripts/narrate.py"
nar = json.load(open("narration.json"))
b = json.load(open("beats.json"))
start = {x["id"]: x["start"] for x in b["beats"]}
trim = max(0.0, b["beats"][0]["start"] - 0.1)  # drop the blank lead-in
# per-beat narration delay (s after beat start) so the line lands on the on-chain result, not the click
OFFSET = {"console": 3.0, "wallets": 3.3, "load": 1.2, "lender": 9.3, "ack": 1.5, "share": 1.0}
script = [{"t": round(start[n["id"]] + OFFSET.get(n["id"], 0.3) - trim, 3), "text": n["text"]} for n in nar]
json.dump(script, open("script.json", "w"), indent=1)
subprocess.run([sys.executable, str(NARRATE), "script.json", "--voice", "af_heart", "--speed", "1.08",
                "--out", "narration.wav", "--timings", "timings-final.json"], check=True)
src = open("video-path.txt").read().strip()
total = b["endAt"] - trim
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-ss", f"{trim:.3f}", "-i", src, "-i", "narration.wav",
                "-t", f"{total:.3f}", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
                "-ar", "48000", "-c:a", "aac", "-b:a", "160k", "-af", "apad", "-movflags", "+faststart", "-shortest", "hisab-monad-demo.mp4"], check=True)
print("trim", trim, "total", total)
