"""Execute the artist conversion in isolated processes with explicit rig fixes.
The per-character generated scripts are preserved in the build artifact.
"""
import pathlib, subprocess, sys
source=pathlib.Path('baseline-club/tools/asset-audit.py').read_text()
# FaceRing is a facial control, NOT a ring finger. Facial animation is frozen.
source=source.replace("if any(x in s for x in ['thumb','index','middle','ring','pinky','hand']):", "if any(x in s for x in ['thumb','index','middle','pinky','hand']) or s.startswith('def-ring'):")
source=source.replace("if 'shin' in s or 'knee' in s:", "if 'shin' in s or 'knee' in s or 'ankle' in s:")
source=source.replace("if 'pelvis' in s or 'spine1' in s:", "if 'pelvis' in s or 'spine1' in s or 'hip' in s:")
source=source.replace("for vert in me.vertices:\n", "rigid_head=any(w in o.name.lower() for w in ['head','hair','eye','brow','lash','gum','tongue'])\n  for vert in me.vertices:\n")
source=source.replace("for vg in vert.groups:\n", "for vg in ([] if rigid_head else vert.groups):\n")
source=source.replace("if total<1e-7:mixp=original;total=1;combined={3 if any(w in o.name.lower() for w in ['head','hair','eye','brow','lash','gum','tongue']) else 0:1}", "if total<1e-7:mixp=original;total=1;combined={3 if rigid_head else 0:1}")
for who in ['rain','snow']:
    script=source.replace("for who in ['rain','snow']:","for who in ['"+who+"']:")
    p=pathlib.Path('asset-audit')/('convert-'+who+'.py');p.write_text(script)
    result=subprocess.run([sys.executable,'-u',str(p)],timeout=300)
    output=pathlib.Path('asset-audit')/(who+'-tennis.glb')
    if result.returncode or not output.exists():raise RuntimeError(who+' conversion failed: '+str(result.returncode))
