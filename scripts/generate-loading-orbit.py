#!/usr/bin/env python3
"""Generate the local single-source lensed-orbit symbol (optional Pillow).

The front half is an ordinary projected ellipse. On the far half, two image
paths bend around opposite sides of the shadow and merge at the limbs. This
is a deliberately readable symbolic animation, not a solved null geodesic.
No JavaScript animation or downloaded image is needed by the website.
"""
from pathlib import Path
import argparse
import math
from PIL import Image, ImageDraw

WIDTH, HEIGHT, SCALE = 192, 128, 4
FRAMES, DURATION_MS = 80, 50
CX, CY, RX, RY, SHADOW = 96, 64, 66, 13, 25
BG = (3, 7, 13)
PALE = (221, 244, 255)
BLUE = (143, 201, 238)
ROOT = Path(__file__).resolve().parents[1]


def smoothstep(lo, hi, value):
    t = max(0, min(1, (value-lo)/(hi-lo)))
    return t*t*(3-2*t)


def images_at(phase):
    theta = phase*math.tau
    x = RX*math.cos(theta)
    if math.sin(theta) >= 0:
        return [(CX+x, CY+RY*math.sin(theta), 1.)]
    # Far-side images share a horizontal position. A smooth envelope reaches
    # outside the shadow at its centre, remains clear of its limb, and joins
    # with a zero derivative at both far-orbit endpoints.
    far = -math.sin(theta)
    split = smoothstep(0, .32, far)
    perimeter = math.sqrt(max(0, (SHADOW+5)**2-x*x))
    a, b = RY*far, perimeter
    bend = .5*(a+b+math.sqrt((a-b)**2+16))-2*(1-split)
    # The dim secondary fades in/out while coincident at the join; there is
    # only one moving source on the entire front half.
    return [(CX+x, CY-bend, 1.), (CX+x, CY+bend, .76*split)]


def frame(phase):
    image = Image.new('RGB', (WIDTH*SCALE, HEIGHT*SCALE), BG)
    d = ImageDraw.Draw(image)
    def ellipse(x,y,r,color,width=0):
        box=tuple(round(v*SCALE) for v in (x-r,y-r,x+r,y+r))
        if width:d.ellipse(box,outline=color,width=max(1,round(width*SCALE)))
        else:d.ellipse(box,fill=color)
    ellipse(CX,CY,SHADOW,(0,0,0))
    ellipse(CX,CY,SHADOW+1,(65,99,126),1)
    for x,y,alpha in images_at(phase):
        if alpha<=.001:continue
        color=tuple(round(b+(p-b)*alpha) for b,p in zip(BG,PALE))
        ellipse(x,y,3.5,color)
        ellipse(x,y,1.25,tuple(round(b+(255-b)*alpha) for b in BG))
    return image.resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)


def svg():
    x,y,_=images_at(.18)[0]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="192" height="128" viewBox="0 0 192 128" role="img" aria-label="A single body orbiting a black hole">
<rect width="192" height="128" fill="#03070d"/>
<circle cx="96" cy="64" r="26" fill="#000" stroke="#41637e" stroke-width="1"/>
<circle cx="{x:.3f}" cy="{y:.3f}" r="3.5" fill="#ddf4ff"/>
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
