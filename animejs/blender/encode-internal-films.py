"""Encode validated complete support/interior sequences."""
import json,subprocess,sys
from pathlib import Path
BASE=Path(__file__).resolve().parent;cfg=json.loads((BASE/'internal-films.json').read_text());kind=sys.argv[1]
assert kind in ('support','interior')
frames=BASE.parent/'renders/production'/kind;public=BASE.parent/'public'
missing=[i for i in range(1,cfg['frames']+1) if not(frames/f'frame_{i:04d}.png').exists()]
if missing:raise SystemExit(f'Missing {len(missing)} frames')
subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(cfg['fps']),'-start_number','1','-i',str(frames/'frame_%04d.png'),'-frames:v',str(cfg['frames']),'-c:v','libx264','-crf','18','-preset','slow','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(public/'videos'/f'luma-a344-{kind}.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(frames/'frame_0001.png'),'-frames:v','1','-quality','92',str(public/'images'/f'luma-a344-{kind}.webp')],check=True)
