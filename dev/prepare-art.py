"""Export transparent Doug PNG sources to production WebP.
Use --clean-backgrounds for user-authorized cleanup of opaque generated sources.
Requires Pillow; cleanup additionally needs NumPy, scipy, opencv-python-headless.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--clean-backgrounds', action='store_true',
                    help='replace opaque source PNG backgrounds with real alpha before export')
args = parser.parse_args()

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'dev' / 'art-source'
DEST = ROOT / 'assets' / 'art'
DEST.mkdir(exist_ok=True)

base = Image.open(SOURCE / 'doug-chill.png').convert('RGBA')
for file in sorted(SOURCE.glob('doug-*.png')):
    im = Image.open(file).convert('RGBA')
    changed = False
    if im.getpixel((0, 0))[3] != 0:
        if not args.clean_backgrounds:
            raise ValueError(f'{file.name} has an opaque background. Clean the source before exporting '
                             '(--clean-backgrounds enables the approved local cleanup).')
        import numpy as np
        import cv2
        from scipy import ndimage
        pixels = np.array(im)
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
        cv2.setRNGSeed(0)
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
        # Feather with nearby character colors, not the original checkerboard
        # pixels. Otherwise antialiasing reintroduces a pale outline on dark UI.
        _, nearest = ndimage.distance_transform_edt(~foreground, return_indices=True)
        rgb[~foreground] = rgb[nearest[0][~foreground], nearest[1][~foreground]]
        alpha = Image.fromarray((foreground * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45))
        pixels[:, :, 3] = np.array(alpha)
        pixels[pixels[:, :, 3] == 0, :3] = 0
        im = Image.fromarray(pixels)
        changed = True
    if args.clean_backgrounds:
        # Remove near-invisible generated alpha noise outside the master too.
        alpha = im.getchannel('A')
        cleaned_alpha = alpha.point(lambda value: 0 if value <= 8 else value)
        if alpha.tobytes() != cleaned_alpha.tobytes():
            im.putalpha(cleaned_alpha)
            changed = True
    alpha = im.getchannel('A')
    assert all(alpha.crop(box).getextrema()[1] == 0 for box in
               [(0, 0, im.width, 1), (0, im.height - 1, im.width, im.height),
                (0, 0, 1, im.height), (im.width - 1, 0, im.width, im.height)]), f'{file.name}: opaque border pixels'
    assert alpha.histogram()[0] > im.width * im.height * .4, f'{file.name}: missing transparent background'
    if changed:
        # Keep the reusable PNG at its original resolution. The previous
        # pipeline applied alpha only to the WebP, leaving fake checkerboards
        # in the source folder. Unprocessed originals remain in Git history.
        temporary = file.with_suffix('.tmp.png')
        im.save(temporary, 'PNG', optimize=True)
        temporary.replace(file)
        print(f'{file.relative_to(ROOT)}: saved transparent {im.width}x{im.height} PNG', flush=True)
    im = im.resize((800, 800), Image.Resampling.LANCZOS)
    out = DEST / (file.stem + '.webp')
    im.save(out, 'WEBP', quality=88, method=6)
    assert im.getpixel((0, 0))[3] == 0
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes', flush=True)
