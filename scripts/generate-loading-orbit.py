#!/usr/bin/env python3
"""Rebuild the original, symbolic lensed-orbit loading GIF.

Optional development dependency: Pillow. Nothing here runs in the website.
The angular phase has constant speed; during the far half of the orbit, a
second image lifts smoothly above the shadow and merges again at the limb.
This is a deliberately legible lensing symbol, not a solved photon geodesic.
"""
from pathlib import Path
import argparse
import math
from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT, SCALE = 192, 128, 4
FRAMES, DURATION_MS = 80, 50
CX, CY, RX, RY = 96, 68, 72, 12
SHADOW, HALO, LIFT = 25, 30, 20
SHADOW_FILL = (1, 4, 8)
BG = (9, 19, 33)
PALE = (221, 244, 255)
BLUE = (143, 201, 238)
ROOT = Path(__file__).resolve().parents[1]


def smoothstep(lo, hi, value):
    t = max(0, min(1, (value - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def orbit(theta, lensed=False):
    s = math.sin(theta)
    far = max(0, -s)
    # The quartic lift has zero slope where both image paths join. Its peak
    # lies just above the halo. All phases and derivatives repeat each loop.
    return (CX + RX * math.cos(theta), CY + RY * s - (LIFT * far**4 if lensed else 0))


def polyline(draw, points, fill, width):
    draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=fill,
              width=max(1, round(width * SCALE)), joint='curve')


def ellipse(draw, bounds, fill=None, outline=None, width=1):
    draw.ellipse(tuple(round(x * SCALE) for x in bounds), fill=fill,
                 outline=outline, width=round(width * SCALE))


def blend(color, strength):
    return tuple(round(b + (c - b) * strength) for b, c in zip(BG, color))


def dot(image, point, alpha, radius=3.4):
    if alpha <= .001:
        return
    x, y = point
    # Only a tiny, local glow; the image remains a compact geometric symbol.
    glow = Image.new('RGBA', image.size)
    gd = ImageDraw.Draw(glow)
    ellipse(gd, (x-5, y-5, x+5, y+5), fill=(*BLUE, round(alpha*82)))
    glow = glow.filter(ImageFilter.GaussianBlur(2.2*SCALE))
    image.alpha_composite(glow)
    d = ImageDraw.Draw(image)
    ellipse(d, (x-radius, y-radius, x+radius, y+radius), fill=(*blend(PALE, alpha), 255))
    ellipse(d, (x-radius*.44, y-radius*.44, x+radius*.44, y+radius*.44), fill=(*blend((255,255,255), alpha), 255))


def frame(phase):
    image = Image.new('RGBA', (WIDTH*SCALE, HEIGHT*SCALE), (*BG, 255))
    d = ImageDraw.Draw(image)
    back = [orbit(math.pi + math.pi*i/160) for i in range(161)]
    upper = [orbit(math.pi + math.pi*i/160, True) for i in range(161)]
    front = [orbit(math.pi*i/160) for i in range(161)]
    polyline(d, back, (*blend(BLUE, .30),255), 1.3)
    ellipse(d, (CX-HALO,CY-HALO,CX+HALO,CY+HALO), outline=(*blend(BLUE,.65),255), width=2.8)
    # Rear source and its short trace are hidden by the central shadow.
    theta = phase*math.tau
    far = max(0, -math.sin(theta))
    split = smoothstep(0, .72, far)
    if far > 0:
        for k in range(5, 0, -1):
            prev = theta - k*.018
            if math.sin(prev) < 0:
                dot(image, orbit(prev), (1-.35*split)*(.07*(6-k)), 1.1)
        dot(image, orbit(theta), 1-.35*split)
    d = ImageDraw.Draw(image)
    ellipse(d, (CX-SHADOW,CY-SHADOW,CX+SHADOW,CY+SHADOW), fill=(*SHADOW_FILL,255))
    # Draw the bent rear image and the foreground edge above that mask.
    polyline(d, upper, (*blend(BLUE,.87),255), 2.2)
    polyline(d, front, (*blend(BLUE,.80),255), 2.1)
    if far > 0:
        for k in range(5, 0, -1):
            prev = theta - k*.018
            if math.sin(prev) < 0:
                dot(image, orbit(prev, True), split*(.07*(6-k)), 1.1)
        dot(image, orbit(theta, True), split)
    else:
        for k in range(5, 0, -1):
            prev = theta-k*.018
            if math.sin(prev) >= 0:
                dot(image, orbit(prev), .07*(6-k), 1.1)
        dot(image, orbit(theta), 1)
    return image.convert('RGB').resize((WIDTH,HEIGHT), Image.Resampling.LANCZOS)


def svg():
    def path(start, finish, lensed=False):
        pts = [orbit(start+(finish-start)*i/160,lensed) for i in range(161)]
        return 'M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in pts)
    p=orbit(.18*math.pi)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="192" height="128" viewBox="0 0 192 128" role="img" aria-label="An orbit and its lensed image around a black hole">
<rect width="192" height="128" fill="#091321"/>
<g fill="none" stroke="#8fc9ee" stroke-linecap="round" stroke-linejoin="round">
<path d="{path(math.pi,math.tau)}" opacity=".30" stroke-width="1.3"/>
<circle cx="96" cy="68" r="30" opacity=".65" stroke-width="2.8"/>
<circle cx="96" cy="68" r="25" fill="#010408" stroke="none"/>
<path d="{path(math.pi,math.tau,True)}" opacity=".87" stroke-width="2.2"/>
<path d="{path(0,math.pi)}" opacity=".8" stroke-width="2.1"/>
</g><circle cx="{p[0]:.3f}" cy="{p[1]:.3f}" r="3.4" fill="#ddf4ff"/>
</svg>
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--contact-sheet',type=Path)
    args=parser.parse_args()
    images=[frame(i/FRAMES) for i in range(FRAMES)]
    # A common palette avoids color flicker between independent frame palettes.
    sheet=Image.new('RGB',(WIDTH*10,HEIGHT*8),BG)
    for i,image in enumerate(images):sheet.paste(image,((i%10)*WIDTH,(i//10)*HEIGHT))
    palette=sheet.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
    indexed=[image.quantize(palette=palette,dither=Image.Dither.NONE) for image in images]
    assets=ROOT/'dist'/'assets';assets.mkdir(exist_ok=True)
    target=assets/'loading-orbit.gif'
    indexed[0].save(target,save_all=True,append_images=indexed[1:],duration=DURATION_MS,
                    loop=0,optimize=True,disposal=1)
    (assets/'loading-orbit-still.svg').write_text(svg())
    if args.contact_sheet:
        selected=[0,10,20,30,40,48,52,55,60,65,68,79]
        contact=Image.new('RGB',(WIDTH*4,HEIGHT*3),BG)
        for i,n in enumerate(selected):contact.paste(images[n],((i%4)*WIDTH,(i//4)*HEIGHT))
        contact.save(args.contact_sheet)
    with Image.open(target) as gif:
        assert gif.n_frames==FRAMES
        assert gif.size==(WIDTH,HEIGHT)
        assert gif.info['loop']==0
        for i in range(FRAMES):
            gif.seek(i)
            assert gif.info['duration']==DURATION_MS
    assert target.stat().st_size < 150_000
    print(f'{target.name}: {FRAMES} frames, {FRAMES*DURATION_MS/1000:.1f}s, {target.stat().st_size} bytes')


if __name__=='__main__':
    main()
