import argparse, json, os, sys
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--before', required=True)
ap.add_argument('--after', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--only', default='')
ap.add_argument('--labels', default='Before,After')
a = ap.parse_args()
labels = (a.labels.split(',') + ['After'])[:2]
if len(a.labels.split(',')) < 2: labels = ['Before', 'After']

CROP_SCREENS = 2.2   # full-page shots taller than this many screens are cropped
LONG_SIDE = 2000
GAP = 24
CAP_H = 36

def names(d):
    return {f[:-4] for f in os.listdir(d) if f.lower().endswith('.png')}

def font(size):
    for p in ('DejaVuSans.ttf', '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf'):
        try: return ImageFont.truetype(p, size)
        except OSError: pass
    return ImageFont.load_default(size)

def screen_h(w, h):
    from_vp = {390: 844, 360: 640, 768: 1024, 1440: 900}
    for vw, vh in from_vp.items():
        if w == vw or w == vw * 2:
            return vh * (w / vw)
    return None

only = {s for s in a.only.split(',') if s}
nb, na = names(a.before), names(a.after)
both = sorted(nb & na)
if only: both = [n for n in both if n in only]
os.makedirs(a.out, exist_ok=True)
f = font(18)
pairs = []
for n in both:
    ims, cropped = [], False
    for d in (a.before, a.after):
        im = Image.open(os.path.join(d, n + '.png')).convert('RGB')
        sh = screen_h(im.width, im.height)
        if sh and im.height > sh * CROP_SCREENS * 1.05:
            im = im.crop((0, 0, im.width, int(sh * CROP_SCREENS))); cropped = True
        ims.append(im)
    H = max(i.height for i in ims)
    W = sum(i.width for i in ims) + GAP
    c = Image.new('RGB', (W, H + CAP_H), (60, 60, 60))
    dr = ImageDraw.Draw(c)
    x = 0
    for lab, im in zip(labels, ims):
        c.paste(im, (x, CAP_H))
        cap = lab + (' (top 2.2 screens)' if cropped else '')
        dr.text((x + 8, 8), cap, fill=(255, 255, 255), font=f)
        x += im.width + GAP
    c.thumbnail((LONG_SIDE, LONG_SIDE))
    jpg = n + '.jpg'
    c.save(os.path.join(a.out, jpg), 'JPEG', quality=82)
    pairs.append({'name': n, 'before': os.path.join(a.before, n + '.png'),
                  'after': os.path.join(a.after, n + '.png'), 'cropped': cropped,
                  'jpg': os.path.join(a.out, jpg)})

man = {'pairs': pairs, 'onlyBefore': sorted(nb - na), 'onlyAfter': sorted(na - nb)}
with open(os.path.join(a.out, 'pairs.json'), 'w') as fh:
    json.dump(man, fh, indent=2)
print(f'{len(pairs)} pairs -> {a.out}')
if man['onlyBefore']: print('only in before:', ', '.join(man['onlyBefore']))
if man['onlyAfter']: print('only in after:', ', '.join(man['onlyAfter']))
