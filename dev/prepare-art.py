"""User-authorized cleanup of generated Doug PNGs; originals preserved.
Requires Pillow, NumPy, scipy, opencv-python-headless. Only for art changes.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
import cv2
from scipy import ndimage
import shutil

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'dev' / 'art-source'
DEST = ROOT / 'assets' / 'art'
SOURCE.mkdir(exist_ok=True)
for file in DEST.glob('*.png'):
    target = SOURCE / file.name
    assert file.resolve().is_relative_to(ROOT) and target.resolve().is_relative_to(ROOT)
    if not target.exists():
        shutil.copy2(file, target)

base = Image.open(SOURCE / 'doug-chill.png').convert('RGBA')
for file in sorted(SOURCE.glob('doug-*.png')):
    im = Image.open(file).convert('RGBA')
    pixels = np.array(im)
    if pixels[0, 0, 3] != 0:
        # The successful original provides anatomical certainty. Graph-cut
        # refines the edge against each expression's actual pixel colors.
        # This preserves dark body paint that a chroma key would eat away.
        reference = np.array(base.resize(im.size))[:, :, 3] > 128
        inside = ndimage.binary_erosion(reference, iterations=22)
        outside = ~ndimage.binary_dilation(reference, iterations=45)
        rgb = pixels[:, :, :3]
        chroma = np.ptp(rgb.astype(np.int16), axis=2)
        mask = np.full(reference.shape, cv2.GC_PR_BGD, dtype=np.uint8)
        mask[reference] = cv2.GC_PR_FGD
        mask[inside] = cv2.GC_FGD
        mask[outside] = cv2.GC_BGD
        # Preserve the two earned gold sparkles, outside the base silhouette.
        if 'locked_in' in file.stem:
            gold = (chroma > 65) & (rgb[:, :, 0] > 160)
            gold[:, :int(im.width * .48)] = False
            gold[:, int(im.width * .61):] = False
            gold[int(im.height * .23):, :] = False
            mask[ndimage.binary_dilation(gold, iterations=3)] = cv2.GC_PR_FGD
            mask[gold] = cv2.GC_FGD
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None,
                    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                    5, cv2.GC_INIT_WITH_MASK)
        foreground = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
        labels, count = ndimage.label(foreground)
        sizes = np.bincount(labels.ravel())
        keep = sizes > 250
        keep[0] = False
        foreground = keep[labels]
        foreground = ndimage.binary_fill_holes(foreground)
        # Trim the generated checkerboard's tinted edge fringe without
        # altering enclosed body paint or the face.
        neutral_edge = (chroma < 25) & (rgb.mean(2) > 90) & ~inside
        foreground[neutral_edge] = False
        foreground = ndimage.binary_opening(foreground, iterations=1)
        foreground = ndimage.binary_fill_holes(foreground)
        alpha = Image.fromarray((foreground * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45))
        pixels[:, :, 3] = np.array(alpha)
        pixels[pixels[:, :, 3] == 0, :3] = 0
        im = Image.fromarray(pixels)
    im = im.resize((800, 800), Image.Resampling.LANCZOS)
    out = DEST / (file.stem + '.webp')
    im.save(out, 'WEBP', quality=88, method=6)
    assert im.getpixel((0, 0))[3] == 0
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes', flush=True)

for file in DEST.glob('doug-*.png'):
    assert file.resolve().is_relative_to(DEST.resolve()) and (SOURCE / file.name).exists()
    file.unlink()
