from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
out = root / 'app/assets'
out.mkdir(parents=True, exist_ok=True)
factor = 4
image = Image.new('RGBA', (512 * factor, 512 * factor), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
def pts(values):
    return [(int(x * factor), int(y * factor)) for x, y in values]
def curve(start, c1, c2, end, count=60):
    result = []
    for i in range(count + 1):
        t = i / count
        result.append(tuple((1-t)**3*start[k] + 3*(1-t)**2*t*c1[k] + 3*(1-t)*t*t*c2[k] + t**3*end[k] for k in range(2)))
    return result
draw.rounded_rectangle((0, 0, 512*factor-1, 512*factor-1), 116*factor, fill='#4c623c')
leaf = curve((376,114),(190,86),(95,196),(159,315)) + curve((159,315),(223,434),(400,315),(376,114))
draw.polygon(pts(leaf), fill='#e4edcb')
for line in [[(137,389),(285,210)],[(207,312),(194,225)],[(243,268),(320,256)]]:
    draw.line(pts(line), fill='#4c623c', width=22*factor)
    for x, y in line:
        draw.ellipse(((x-11)*factor,(y-11)*factor,(x+11)*factor,(y+11)*factor), fill='#4c623c')
draw.ellipse((339*factor,337*factor,417*factor,415*factor),fill='#e7b477')
image = image.resize((512,512), Image.Resampling.LANCZOS)
image.save(out / 'icon.png')
image.save(out / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Application icons generated.')
