"""Optimize the checked-in assets and rebuild their embedded JavaScript bundle.

Run with Python 3 and Pillow: python optimize_assets.py
Only project-local assets are read; no original downloads are needed. Use this
script for subsequent bundle rebuilds, not prepare_assets.py (which uses external
source files). Images already within their limits are never resized/re-encoded.
Favicon, font and other PNGs are not modified. Unknown bundle fields are retained.
"""
from pathlib import Path
import base64
import json
import re

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
BUNDLE = ROOT / 'assets.js'


def data_url(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def optimize_png(path, limit):
    """Downsample once to a fixed bounding box, keeping alpha and aspect ratio."""
    with Image.open(path) as source:
        before = source.size
        has_alpha = 'A' in source.getbands() or 'transparency' in source.info
        if source.width > limit[0] or source.height > limit[1]:
            image = source.convert('RGBA' if has_alpha else 'RGB')
            image.thumbnail(limit, Image.Resampling.LANCZOS)
            # Load before closing the source and replacing its on-disk file.
            image.load()
        else:
            image = None
    if image is not None:
        image.save(path, format='PNG', optimize=True)
    with Image.open(path) as result:
        assert result.width <= limit[0] and result.height <= limit[1], path
        if has_alpha:
            assert 'A' in result.getbands(), f'Alpha channel lost: {path}'
        alpha = result.getchannel('A').getextrema() if 'A' in result.getbands() else None
        print(f'{path.name}: {before} -> {result.size}, mode={result.mode}, alpha={alpha}')


def main():
    # Parse before modifying any resources. Never evaluate JavaScript.
    text = BUNDLE.read_text(encoding='utf-8')
    match = re.fullmatch(r'\s*(window\.ACHIEVEMENT_ASSETS\s*=\s*)(.*?)\s*;?\s*',
                         text, flags=re.DOTALL)
    if not match:
        raise ValueError('Expected window.ACHIEVEMENT_ASSETS JSON assignment')
    bundle = json.loads(match.group(2))
    if not isinstance(bundle, dict) or not isinstance(bundle.get('icons', {}), dict):
        raise ValueError('Expected an object bundle and object icons field')
    icon_paths = sorted(ASSETS.glob('icon-*.png'))
    required = [ASSETS / name for name in ('background.png', 'frame.png', 'hk4e_zh-cn.ttf')]
    required.extend(icon_paths)
    for path in required:
        if not path.is_file():
            raise FileNotFoundError(f'Required project-local asset missing: {path}')
        # Reject external symlink targets as well as explicit external inputs.
        if not path.resolve().is_relative_to(ROOT):
            raise ValueError(f'Asset must resolve inside the project: {path}')
    if not icon_paths:
        raise ValueError('No project-local icon-*.png assets found')

    before_bytes = BUNDLE.stat().st_size
    for name in ('background.png', 'frame.png'):
        optimize_png(ASSETS / name, (1936, 560))
    for path in icon_paths:
        optimize_png(path, (384, 384))

    bundle['background'] = data_url(ASSETS / 'background.png', 'image/png')
    bundle['frame'] = data_url(ASSETS / 'frame.png', 'image/png')
    bundle['font'] = data_url(ASSETS / 'hk4e_zh-cn.ttf', 'font/ttf')
    icons = bundle.setdefault('icons', {})
    for path in icon_paths:
        icons[path.stem.removeprefix('icon-')] = data_url(path, 'image/png')
    output = 'window.ACHIEVEMENT_ASSETS = ' + json.dumps(bundle, ensure_ascii=False) + ';\n'
    # Re-running with unchanged resources also leaves bundle bytes untouched.
    if output != text:
        BUNDLE.write_text(output, encoding='utf-8', newline='\n')
    after_bytes = BUNDLE.stat().st_size
    print(f'assets.js: {before_bytes:,} -> {after_bytes:,} bytes '
          f'({(1 - after_bytes / before_bytes) * 100:.2f}% smaller)')


if __name__ == '__main__':
    main()
