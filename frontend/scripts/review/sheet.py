# Contact sheet: lay several screenshots side by side to review them together.
# usage: python3 sheet.py out.png a.png b.png ...   (needs Pillow)
import sys
from PIL import Image
out = sys.argv[1]; files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
H = max(i.height for i in ims); gap = 24
W = sum(i.width for i in ims) + gap * (len(ims) - 1)
c = Image.new('RGB', (W, H), (60, 60, 60)); x = 0
for i in ims: c.paste(i, (x, 0)); x += i.width + gap
c.thumbnail((2000, 1400)); c.save(out)
