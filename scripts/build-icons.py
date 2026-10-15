#!/usr/bin/env python3
"""Rasterize the canonical Qiye SVG for Chrome/Edge extension icons.

Uses the same Playwright/Chromium dependency as the browser regression suites.
Set CHROMIUM_PATH to use an existing Chromium executable.
"""
import base64
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SIZES = (16, 32, 48, 128)


def main():
    source = ROOT / 'icons/qiye-icon.svg'
    data_url = 'data:image/svg+xml;base64,' + base64.b64encode(source.read_bytes()).decode('ascii')
    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_PATH')
        browser = playwright.chromium.launch(**({'executable_path': executable} if executable else {}))
        try:
            page = browser.new_page()
            images = page.evaluate('''async ({source, sizes}) => {
                const image = new Image();
                image.src = source;
                await image.decode();
                return sizes.map(size => {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = size;
                    const context = canvas.getContext('2d', {alpha: true});
                    context.drawImage(image, 0, 0, size, size);
                    return canvas.toDataURL('image/png').split(',')[1];
                });
            }''', {'source': data_url, 'sizes': SIZES})
        finally:
            browser.close()
    for size, data in zip(SIZES, images):
        output = ROOT / 'icons' / f'icon{size}.png'
        output.write_bytes(base64.b64decode(data, validate=True))
        print(f'{output.relative_to(ROOT).as_posix()}: {size} x {size}')


if __name__ == '__main__':
    main()
