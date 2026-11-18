#!/usr/bin/env python3
"""Build cached quick scene screenshots; runtime never renders thumbnails.
Usage: python3 scripts/build-thumbnails.py --work /absolute/scratch [--jobs 2]
Each image is one complete live High frame at 640 x 422. Desktop and mobile
share the same screenshot, with the scene's initial camera and full framing.
"""
import argparse,concurrent.futures,json,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--jobs',type=int,default=2);p.add_argument('--scene',action='append');args=p.parse_args();work=Path(args.work).resolve();work.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(root/'scripts/thumbnail-snapshot.mjs'),str(work)],cwd=root,check=True)
ids=json.loads((work/'scenes.json').read_text());ids=[x for x in ids if not args.scene or x in args.scene]
assets=root/'dist/assets';manifest_path=assets/'thumbnail-manifest.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'format':2,'preset':'quick','maxWidth':640,'maxHeight':422,'scenes':{}}
manifest.update({'format':2,'preset':'quick','maxWidth':640,'maxHeight':422});manifest.pop('budgetSeconds',None)
def render(scene):
 output=assets/('atlas-'+scene+'.webp');command=['python3',str(root/'scripts/bake-thumbnails.py'),str(work/(scene+'.json')),str(output)]
 result=subprocess.run(command,cwd=root,capture_output=True,text=True)
 if result.returncode:raise RuntimeError(scene+': '+result.stderr[-3000:])
 metadata=json.loads(output.with_suffix('.render.json').read_text());output.with_suffix('.render.json').unlink();return scene,metadata
started=time.monotonic();failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(2,args.jobs))) as executor:
 futures={executor.submit(render,scene):scene for scene in ids}
 for i,future in enumerate(concurrent.futures.as_completed(futures),1):
  try:scene,metadata=future.result()
  except Exception as error:failures.append(str(error));print('FAILED '+str(error),flush=True);continue
  manifest['scenes'][scene]=metadata;temporary_manifest=manifest_path.with_suffix('.tmp');temporary_manifest.write_text(json.dumps(manifest,indent=2)+'\n');temporary_manifest.replace(manifest_path);print(f'{i}/{len(ids)} {scene}: {metadata["width"]}x{metadata["height"]}, {metadata["renderSeconds"]} seconds, {metadata["completePasses"]} complete passes; total {time.monotonic()-started:.0f}s',flush=True)
if failures:raise SystemExit('Failed scenes: '+'; '.join(failures))
print('Cached thumbnail set complete.',flush=True)
