"""Make the lightweight CPU globe's coastal, arid-land and snow outlines
from the same locally bundled Blue Marble map used for the GPU. No downloads."""
import base64, io, json
from pathlib import Path
import numpy as np
from PIL import Image
from contourpy import contour_generator
from matplotlib.path import Path as MplPath

dist=Path(__file__).resolve().parents[1]/'dist'
maps=json.loads((dist/'planet-texture-data.js').read_text().split(' = ',1)[1].strip().rstrip(';'))
im=Image.open(io.BytesIO(base64.b64decode(maps['maps']['1'].split(',')[1]))).resize((240,121),Image.Resampling.LANCZOS)
r,g,b=np.asarray(im).astype(float).transpose(2,0,1)
land=np.clip((r+g)*.5-b+11,0,70)*np.clip((r+g)*.5-12,0,1)
masks=[np.maximum(land-9,np.minimum(r,g)-138),np.minimum(np.minimum((r-b)-18,r-g-5),land-12),np.minimum(np.minimum(r,g)-138,land-5)]
def ring(poly):
    # Simplify a color boundary within a tile; preserve the spherical limb
    # by subdividing long straight coast or tile-border edges before export.
    poly=MplPath(poly).cleaned(simplify=True,curves=False).vertices[:-1]
    out=[]
    for aa,bb in zip(poly[:-1],poly[1:]):
        steps=max(1,int(np.ceil(np.max(np.abs(bb-aa))/6)))
        for t in range(steps):
            x,y=aa+(bb-aa)*t/steps
            ix,iy=int(round(2*x)),int(round(2*y))
            v=iy*512+ix
            if not out or out[-1]!=v:out.append(v)
    return out
sets=[]
for mask in masks:
    tiles=[]
    mask=np.column_stack((mask,mask[:,0]))
    for y in range(0,120,20):
        for x in range(0,240,20):
            paths=[]
            filled=contour_generator(x=np.arange(x,x+21),y=np.arange(y,y+21),z=mask[y:y+21,x:x+21],fill_type='OuterOffset').filled(0,1000)
            for poly,offsets in zip(*filled):
                a=poly[:-1];area=abs(np.sum(a[:,0]*np.roll(a[:,1],1)-a[:,1]*np.roll(a[:,0],1)))*.5
                if area<1.6:continue
                for lo,hi in zip(offsets[:-1],offsets[1:]):
                    rr=ring(poly[lo:hi])
                    if len(rr)>=3:paths.append(rr)
            if paths:tiles.append([int((y+10)*2)*512+(x+10)*2,paths])
    sets.append(tiles)
header='// Generated from the bundled NASA Blue Marble map by scripts/generate-earth-outlines.py.\n// Each integer packs a half-texel x and y from a 240 x 120 equirectangular grid.\n'
(dist/'earth-outlines.js').write_text(header+'export const EARTH_OUTLINES='+json.dumps(sets,separators=(',',':'))+';\n')
