#!/usr/bin/env python3
"""Image compression widget and automatic wallpaper upload, on HTTP and preview."""
import argparse
import base64
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
import subprocess
import threading
import zlib

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'output/playwright/image-compressor'
OUT.mkdir(parents=True, exist_ok=True)
initial = json.loads(subprocess.check_output(
    ['node', '--input-type=module', '-e',
     "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"],
    cwd=ROOT,
))


def png_photo(width=720, height=480):
    """Deterministic patterned PNG; lossy WebP should be smaller."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # PNG "None" filter
        for x in range(width):
            rows.extend((
                (x * 13 + y * 17 + (x * y) % 27) % 256,
                (x * 3 + y * 11 + (x * y) % 71) % 256,
                (x * 7 + y * 5 + ((x + y) % 17) * 9) % 256,
                255,
            ))

    def chunk(kind, payload):
        data = kind + payload
        return struct.pack('>I', len(payload)) + data + struct.pack('>I', zlib.crc32(data) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 6))
            + chunk(b'IEND', b''))


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
asset = png_photo()
check_count = 0


def check(label, ok):
    global check_count
    assert ok, label
    check_count += 1
    print('PASS', label, flush=True)


with sync_playwright() as playwright:
    chromium_path = os.environ.get('CHROMIUM_PATH')
    browser = playwright.chromium.launch(**({'executable_path': chromium_path} if chromium_path else {}))
    try:
        for language, theme, width in [('zh-CN', 'light', 1440), ('en', 'dark', 390)]:
            state = copy.deepcopy(initial)
            state['items'] = []
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False)
            context = browser.new_context(viewport={'width':width, 'height':850}, accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(15000)
            errors = []
            outside = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: outside.append(request.url) if request.url.startswith('https://') else None)
            page.route('https://**/*', lambda route: route.abort())
            payload = json.dumps(state, ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'
                                 + json.dumps(payload) + ')')
            page.goto(base, wait_until='domcontentloaded')
            page.locator('#groups [data-group]').first.wait_for()

            page.locator('.top-tools [data-action=add]').click()
            page.locator('[data-add-tab=widgets]').click()
            check(f'{language} widget visible', page.locator('[data-catalog-widget="image-compressor"]').is_visible())
            page.locator('[data-add-widget="image-compressor"]').click()
            page.locator('#dialog').wait_for(state='hidden')
            page.locator('#desktop [data-image-compressor-open]').first.click()
            page.locator('#image-compressor-workspace').wait_for()

            page.locator('[data-image-file]').set_input_files({
                'name': 'test-photo.png', 'mimeType': 'image/png', 'buffer': asset,
            })
            page.locator('[data-image-slider]').evaluate(
                "e=>{e.value='92';e.dispatchEvent(new Event('input',{bubbles:true}));}"
            )
            page.locator('[data-image-run]').click()
            page.locator('[data-image-result]').wait_for(state='visible', timeout=20000)
            page.wait_for_function(
                '() => [...document.querySelectorAll(".image-compressor-compare img")].every(i => i.complete && i.naturalWidth > 0)'
            )
            check(f'{language} compressed result is downloadable',
                  page.locator('[data-image-download]').is_enabled())
            check(f'{language} preview dimensions are unchanged',
                  page.locator('.image-compressor-compare').evaluate(
                      'n=>n.querySelectorAll("img")[0].naturalWidth===n.querySelectorAll("img")[1].naturalWidth && '
                      'n.querySelectorAll("img")[0].naturalHeight===n.querySelectorAll("img")[1].naturalHeight'
                  ))
            with page.expect_download() as received:
                page.locator('[data-image-download]').click()
            check(f'{language} compression download', received.value.suggested_filename.startswith('test-photo'))
            check(f'{language} transient compression did not persist image',
                  not any('data:image' in str(item) for item in
                          json.loads(page.evaluate('localStorage.getItem("qiye.state.v5")'))['items']))
            page.screenshot(path=str(OUT / f'workspace-{language}{"-preview" if args.preview else ""}.png'))
            page.locator('#dialog [data-close]').click()
            page.locator('#dialog').wait_for(state='hidden')

            page.locator('.top-tools [data-action=wallpaper]').click()
            page.locator('#wallpaper-file').set_input_files({
                'name': 'wallpaper.png', 'mimeType': 'image/png', 'buffer': asset,
            })
            page.wait_for_function(
                '() => !!JSON.parse(localStorage.getItem("qiye.state.v5")).settings.customWallpaper',
                timeout=30000
            )
            saved = json.loads(page.evaluate('localStorage.getItem("qiye.state.v5")'))
            wallpaper = saved['settings']['customWallpaper']
            check(f'{language} wallpaper is saved from local upload', wallpaper.startswith('data:image/'))
            if wallpaper.startswith('data:image/webp;base64,'):
                check(f'{language} auto-compressed wallpaper is smaller',
                      len(base64.b64decode(wallpaper.split(',', 1)[1])) < len(asset))
            else:
                check(f'{language} keeping original is allowed',
                      wallpaper.startswith('data:image/png;base64,'))
            check(f'{language} wallpaper type is image', saved['settings']['customWallpaperType'] == 'image')

            too_big_gif = b'GIF89a' + b'\x00' * (4 * 1024 * 1024 + 1)
            page.locator('#wallpaper-file').set_input_files({
                'name': 'oversize.gif', 'mimeType': 'image/gif', 'buffer': too_big_gif,
            })
            page.wait_for_timeout(500)
            check(f'{language} oversized animation cannot overwrite wallpaper',
                  json.loads(page.evaluate('localStorage.getItem("qiye.state.v5")'))['settings']['customWallpaper'] == wallpaper)
            check(f'{language} no browser exceptions', not errors)
            check(f'{language} no unexpected third-party compression requests', not outside)
            context.close()
    finally:
        browser.close()
        server.shutdown()

print(f'Image compression browser checks: {check_count}', flush=True)
