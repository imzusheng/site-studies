"""Encode completed Blender frames: python3 blender/encode.py core|switch|craft|intro."""
import json, subprocess, sys
from pathlib import Path
base = Path(__file__).resolve().parent.parent
config = json.loads((base/'blender/production.json').read_text())
kind = sys.argv[1]
if kind not in ('core', 'switch', 'craft', 'intro'):
    raise SystemExit('Expected core, switch, craft or intro')
frames = base/'renders/production'/kind
public = base/'public'
poster = public/'images'/f'luma-a343-{kind if kind != "intro" else "video-poster"}.webp'
first = frames/('preview_0001.png' if kind == 'craft' else 'frame_0001.png')
subprocess.run(['ffmpeg','-v','error','-y','-i',str(first),'-frames:v','1','-quality','90',str(poster)],check=True)
if kind != 'craft':
    count = 150 if kind == 'intro' else config[kind]['frames']
    missing = [n for n in range(1,count+1) if not (frames/f'frame_{n:04d}.png').exists()]
    if missing: raise SystemExit(f'Incomplete sequence: {len(missing)} missing frames')
    enc=config['encoding']
    command=['ffmpeg','-v','error','-y','-framerate',str(config['fps']),'-start_number','1','-i',str(frames/'frame_%04d.png'),'-frames:v',str(count),'-c:v',enc['codec'],'-crf',str(enc['crf']),'-preset',enc['preset'],'-pix_fmt',enc['pixel_format'],'-an']
    if enc['faststart']: command += ['-movflags','+faststart']
    subprocess.run(command+[str(public/'videos'/f'luma-a343-{kind}.mp4')],check=True)
print(f'Encoded {kind} into {public}')
