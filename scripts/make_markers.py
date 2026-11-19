"""Map marker icons: colour AND shape coded (never colour alone).
available = green circle + tick, closed = red square + cross,
restricted = grey square + padlock, unknown = yellow diamond + '?'.
Writes 1x/2x/3x PNGs for the standard and high-contrast palettes."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
BASE = 34  # dp
PALETTES = {
    'std': {
        'available': ('#00703C', '#FFFFFF', '#FFFFFF'),
        'closed': ('#B10E1E', '#FFFFFF', '#FFFFFF'),
        'restricted': ('#505A5F', '#FFFFFF', '#FFFFFF'),
        'unknown': ('#FFDD00', '#0B0C0C', '#0B0C0C'),
    },
    'hc': {
        'available': ('#00E05A', '#000000', '#000000'),
        'closed': ('#FF5C5C', '#000000', '#000000'),
        'restricted': ('#C8C8C8', '#000000', '#000000'),
        'unknown': ('#FFDD00', '#000000', '#000000'),
    },
}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def draw_icon(status, bg, fg, border, px):
    S = px * 4  # supersample
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    pad = S * 0.12
    box = [pad, pad, S - pad, S - pad]
    # shadow
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    off = S * 0.035
    sbox = [box[0], box[1] + off, box[2], box[3] + off]
    shape(sd, status, sbox, (0, 0, 0, 110), None, 0)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.03))
    im.alpha_composite(sh)
    d = ImageDraw.Draw(im)
    bw = max(2, int(S * 0.07))
    shape(d, status, box, bg, border, bw)
    glyph(d, status, box, fg, S)
    return im.resize((px, px), Image.LANCZOS)


def shape(d, status, box, fill, outline, width):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if status == 'available':
        d.ellipse(box, fill=fill, outline=outline, width=width)
    elif status == 'unknown':
        r = (x1 - x0) / 2 * 1.04
        pts = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
        d.polygon(pts, fill=fill)
        if outline:
            d.line(pts + [pts[0]], fill=outline, width=width, joint='curve')
    else:
        inset = (x1 - x0) * 0.06
        d.rounded_rectangle([x0 + inset, y0 + inset, x1 - inset, y1 - inset], radius=(x1 - x0) * 0.16,
                            fill=fill, outline=outline, width=width)


def glyph(d, status, box, fg, S):
    x0, y0, x1, y1 = box
    w = x1 - x0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    lw = int(w * 0.13)
    if status == 'available':
        pts = [(cx - w * 0.22, cy + w * 0.01), (cx - w * 0.05, cy + w * 0.17), (cx + w * 0.24, cy - w * 0.15)]
        d.line(pts, fill=fg, width=lw, joint='curve')
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=fg)
    elif status == 'closed':
        a = w * 0.19
        d.line([(cx - a, cy - a), (cx + a, cy + a)], fill=fg, width=lw)
        d.line([(cx - a, cy + a), (cx + a, cy - a)], fill=fg, width=lw)
    elif status == 'restricted':
        bw_, bh = w * 0.40, w * 0.30
        d.rounded_rectangle([cx - bw_ / 2, cy - bh * 0.15, cx + bw_ / 2, cy + bh * 0.85], radius=w * 0.05, fill=fg)
        sw = w * 0.26
        d.arc([cx - sw / 2, cy - bh * 0.95, cx + sw / 2, cy + bh * 0.35], 180, 360, fill=fg, width=int(w * 0.08))
        d.line([(cx - sw / 2 + w * 0.04, cy - bh * 0.3), (cx - sw / 2 + w * 0.04, cy - bh * 0.1)], fill=fg, width=int(w * 0.08))
        d.line([(cx + sw / 2 - w * 0.04, cy - bh * 0.3), (cx + sw / 2 - w * 0.04, cy - bh * 0.1)], fill=fg, width=int(w * 0.08))
    else:
        font = ImageFont.truetype(FONT, int(w * 0.55))
        d.text((cx, cy + w * 0.02), '?', font=font, fill=fg, anchor='mm')


for pal, statuses in PALETTES.items():
    for status, (bg, fg, border) in statuses.items():
        for scale in (1, 2, 3):
            px = BASE * scale
            name = f'aed-{pal}-{status}' + ('' if scale == 1 else f'@{scale}x') + '.png'
            draw_icon(status, bg, fg, border, px).save(f'{OUT}/{name}')
# preview sheet
sheet = Image.new('RGBA', (4 * 110, 2 * 110), (230, 230, 230, 255))
for r, pal in enumerate(PALETTES):
    for c, status in enumerate(['available', 'closed', 'restricted', 'unknown']):
        ic = Image.open(f'{OUT}/aed-{pal}-{status}@3x.png')
        sheet.alpha_composite(ic, (c * 110 + 4, r * 110 + 4))
sheet.save('/home/claude/markers-preview.png')
print('markers written')
