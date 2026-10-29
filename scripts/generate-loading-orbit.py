#!/usr/bin/env python3
"""Generate the local lensed-orbit symbol assets (optional Pillow).

The front half is an ordinary projected ellipse. On the far half, two image
paths bend around opposite sides of the shadow and merge at the limbs. This
is a deliberately readable symbolic animation, not a solved null geodesic.
The live worker and compositor indicator use the same symbolic geometry.
This optional asset generator keeps the included GIF and still SVG aligned.
"""
from pathlib import Path
import argparse
import math
from PIL import Image, ImageDraw

WIDTH, HEIGHT, SCALE = 192, 128, 4
FRAMES, DURATION_MS = 80, 50
CX, CY, RX, RY, SHADOW = 96, 64, 60, 12, 19.5
BG = (3, 7, 13)
PALE = (221, 244, 255)
ROOT = Path(__file__).resolve().parents[1]


def images_at(phase):
    theta = phase*math.tau
    x = RX*math.cos(theta)
    if math.sin(theta) >= 0:
        return [(CX+x, CY+RY*math.sin(theta), 1.), (CX+x, CY+RY*math.sin(theta), 0.)]
    # Smooth rear images bend above and below the shadow. The secondary
    # image fades at the joins, where its position coincides with the primary.
    far = -math.sin(theta)
    bend = RY*far+21*far**6
    return [(CX+x, CY-bend, 1.), (CX+x, CY+bend, far*far)]



def frame(phase):
    image = Image.new('RGB', (WIDTH*SCALE, HEIGHT*SCALE), BG)
    d = ImageDraw.Draw(image)
    def ellipse(x,y,r,color,width=0):
        box=tuple(round(v*SCALE) for v in (x-r,y-r,x+r,y+r))
        if width:d.ellipse(box,outline=color,width=max(1,round(width*SCALE)))
        else:d.ellipse(box,fill=color)
    def curve(start,end,branch,color):
        points=[images_at(start+(end-start)*i/80)[branch][:2] for i in range(81)]
        d.line([(round(x*SCALE),round(y*SCALE)) for x,y in points],fill=color,width=max(1,round(1.2*SCALE)))
    curve(.5,1,0,(104,143,169))
    curve(.5,1,1,(56,92,118))
    ellipse(CX,CY,SHADOW,(2,4,9))
    ellipse(CX,CY,SHADOW,(119,156,175),1.2)
    curve(0,.5,0,(108,150,176))
    for x,y,alpha in images_at(phase):
        if alpha<=.001:continue
        color=tuple(round(b+(p-b)*alpha) for b,p in zip(BG,PALE))
        ellipse(x,y,3,color)
        ellipse(x,y,1.25,tuple(round(b+(255-b)*alpha) for b in BG))
    return image.resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)


def svg():
    def path(start,end,branch):
        pts=[images_at(start+(end-start)*i/80)[branch][:2] for i in range(81)]
        return 'M'+'L'.join(f'{x:.3f} {y:.3f}' for x,y in pts)
    x,y,_=images_at(.18)[0]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="192" height="128" viewBox="0 0 192 128" role="img" aria-label="A star on a lensed orbit around a black hole; the rear path splits above and below its shadow">
<rect width="192" height="128" fill="#03070d"/>
<path d="{path(.5,1,0)}" fill="none" stroke="#688fa9" stroke-width="1.2"/>
<path d="{path(.5,1,1)}" fill="none" stroke="#385c76" stroke-width="1.2"/>
<circle cx="96" cy="64" r="19.5" fill="#020409" stroke="#779caf" stroke-width="1.2"/>
<path d="{path(0,.5,0)}" fill="none" stroke="#6c96b0" stroke-width="1.2"/>
<circle cx="{x:.3f}" cy="{y:.3f}" r="3" fill="#ddf4ff"/>
</svg>\n'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contact-sheet',type=Path)
    args=parser.parse_args()
    images=[frame(i/FRAMES) for i in range(FRAMES)]
    sheet=Image.new('RGB',(WIDTH*10,HEIGHT*8),BG)
    for i,image in enumerate(images):sheet.paste(image,((i%10)*WIDTH,(i//10)*HEIGHT))
    palette=sheet.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
    indexed=[image.quantize(palette=palette,dither=Image.Dither.NONE) for image in images]
    # Pin palette index zero to the exact overlay color, preventing an opaque
    # rectangular edge caused by quantization changing the background RGB.
    for image in indexed:
        colors=image.getpalette();bgindex=image.getpixel((0,0));colors[bgindex*3:bgindex*3+3]=list(BG);image.putpalette(colors)
    assets=ROOT/'dist'/'assets';assets.mkdir(exist_ok=True)
    target=assets/'loading-orbit.gif'
    indexed[0].save(target,save_all=True,append_images=indexed[1:],duration=DURATION_MS,loop=0,optimize=True,disposal=1)
    (assets/'loading-orbit-still.svg').write_text(svg())
    if args.contact_sheet:
        selected=[0,10,20,30,40,44,48,52,56,60,64,68,72,76,79]
        contact=Image.new('RGB',(WIDTH*5,HEIGHT*3),BG)
        for i,n in enumerate(selected):contact.paste(images[n],((i%5)*WIDTH,(i//5)*HEIGHT))
        contact.save(args.contact_sheet)
    with Image.open(target) as gif:
        assert gif.n_frames==FRAMES and gif.size==(WIDTH,HEIGHT) and gif.info['loop']==0
        for i in range(FRAMES):
            gif.seek(i);assert gif.info['duration']==DURATION_MS
            assert gif.convert('RGB').getpixel((0,0))==BG
    assert target.stat().st_size<100_000
    print(f'{target.name}: {FRAMES} frames, {FRAMES*DURATION_MS/1000:.1f}s, {target.stat().st_size} bytes')

if __name__=='__main__':main()
