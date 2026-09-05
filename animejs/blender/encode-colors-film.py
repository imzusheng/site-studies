"""Encode the complete, forward-only three-color animation and its poster."""
import json, subprocess
from pathlib import Path
BASE=Path(__file__).resolve().parent
cfg=json.loads((BASE/'colors-film.json').read_text())
frames=BASE.parent/'renders/production/colors'
missing=[i for i in range(1,cfg['frames']+1) if not (frames/f'frame_{i:04d}.png').exists()]
if missing:raise SystemExit(f'Incomplete three-color sequence: {len(missing)} frames missing')
public=BASE.parent/'public'
subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(cfg['fps']),'-start_number','1','-i',str(frames/'frame_%04d.png'),'-frames:v',str(cfg['frames']),'-c:v','libx264','-crf','18','-preset','slow','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(public/'videos/luma-a344-colors.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(frames/'frame_0001.png'),'-frames:v','1','-quality','92',str(public/'images/luma-a344-colors.webp')],check=True)
