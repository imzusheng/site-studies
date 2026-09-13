"""Package current project, verify ZIP CRC, then rebuild extracted sources offline."""
from pathlib import Path
import hashlib,json,subprocess,sys,tempfile,zipfile

root=Path(__file__).resolve().parents[1]
output=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'dist/Baseline-Club-Local-1.zip'
output.parent.mkdir(parents=True,exist_ok=True)
excluded={'.cache','node_modules','dist','.git','__pycache__'}
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(x in excluded for x in p.relative_to(root).parts) and p.name not in {'qa.html'} and p.suffix not in {'.blend1','.pyc'})
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest={p.relative_to(root).as_posix():sha(p) for p in files}
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'baseline-club/'+p.relative_to(root).as_posix())
    z.writestr('baseline-club/PACKAGE-SHA256.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(output) as z:
    broken=z.testzip()
    if broken:raise RuntimeError('ZIP CRC mismatch: '+broken)
    cache=root/'.cache';cache.mkdir(exist_ok=True)
    extracted=Path(tempfile.mkdtemp(prefix='package-verify-',dir=cache))
    z.extractall(extracted) # Entries are created above from this bounded project root.
fresh=extracted/'baseline-club'
for name,expected in manifest.items():
    if sha(fresh/name)!=expected:raise RuntimeError('Extracted hash mismatch: '+name)
subprocess.run(['node','tools/build.mjs'],cwd=fresh,check=True,timeout=30)
if sha(fresh/'index.html')!=sha(root/'index.html'):raise RuntimeError('Fresh offline rebuild differs')
report={'zip':str(output),'bytes':output.stat().st_size,'sha256':sha(output),'crcPassed':True,'filesVerified':len(manifest),'offlineRebuildMatches':True,'htmlSHA256':sha(root/'index.html'),'verificationDirectory':str(fresh)}
output.with_suffix('.verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,indent=2))
