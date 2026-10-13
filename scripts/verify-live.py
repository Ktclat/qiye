#!/usr/bin/env python3
"""Verify deployed assets and current UI using a disposable browser, without API mocks.
Run after publishing: python scripts/verify-live.py --expected /path/qiye-pages.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='https://ktclat.github.io/qiye/')
parser.add_argument('--expected', type=Path, required=True)
parser.add_argument('--output', type=Path, default=ROOT / 'test-results/live')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
key = subprocess.check_output(['node', '--input-type=module', '-e', "import {STORAGE_KEY} from './src/core.js';console.log(STORAGE_KEY)"], cwd=ROOT, text=True).strip()
report = {'url':args.url, 'version':version, 'api_mocks':False, 'assets':{}, 'checks':[]}


def check(name, condition):
    assert condition, name
    report['checks'].append(name)


def save_report():
    (args.output / 'public-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


try:
    for path in ['index.html', 'icons/icon32.png', 'LICENSE']:
        request = urllib.request.Request(args.url + ('' if path == 'index.html' else path), headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            report['assets'][path] = {'status':response.status, 'url':response.url, 'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw)}
        expected = (args.expected / path).read_bytes()
        if path.endswith('.html'):
            expected = expected.replace(b'\r\n', b'\n')
        check(f'Deployed {path} equals the current build', raw == expected)

    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_PATH')
        browser = playwright.chromium.launch(**({'executable_path':executable} if executable else {}))
        context = browser.new_context(viewport={'width':1440, 'height':1000}, locale='en-US')
        page = context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on('pageerror', lambda error:errors.append(str(error)))

        def close():
            page.locator('#dialog [data-close]').first.click()
            page.locator('#dialog').wait_for(state='hidden')

        try:
            check('Public page responds successfully', page.goto(args.url, wait_until='domcontentloaded', timeout=45000).status == 200)
            page.locator('[data-widget=memo]').wait_for()
            check('Fresh English browser has localized defaults', page.locator('html').get_attribute('lang') == 'en' and page.locator('[data-group=home]').inner_text() == 'Home')
            check('New desktop defaults to original transparent icons', page.locator('html').get_attribute('data-icon-shape') == 'original' and page.locator('html').get_attribute('data-icon-backdrop') == 'none')
            page.screenshot(path=str(args.output / 'live-en-desktop.png'), animations='disabled')
            page.locator('#brand-button').click()
            check('Settings show the manifest version', version in page.locator('.settings-nav').inner_text())
            page.locator('[data-preference=language]').select_option('zh-CN')
            page.wait_for_function('document.querySelector("#workspace-title")?.textContent === "设置"')
            page.locator('[data-settings-tab=appearance]').click()
            page.locator('#range-dialogScale').fill('125')
            page.locator('#range-dialogScale').dispatch_event('change')
            page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).settings.dialogScale===125', arg=key)
            page.screenshot(path=str(args.output / 'live-zh-settings.png'), animations='disabled')
            close()
            page.locator('[data-action=widget-calendar-detail]').click()
            check('Published calendar has selectable dates and event editor', page.locator('#widget-detail-body .calendar-cell').count() == 42 and page.locator('#calendar-event-form').count() == 1)
            check('Calendar has its own app header and tabs', page.locator('#dialog .dialog-head').count() == 0 and page.locator('.calendar-app-tabs [role=tab]').count() == 2)
            page.screenshot(path=str(args.output / 'live-calendar.png'), animations='disabled')
            page.locator('[data-page=tools]').click()
            page.locator('[data-tool=festivals]').click()
            check('Published festival timeline has twelve months', page.locator('.festival-month').count() == 12)
            close()
            page.locator('[data-widget=memo] [data-action=widget-memo-new]').first.click()
            page.locator('#memo-title').fill('Live verification')
            page.locator('#memo-text').fill('Temporary browser profile only')
            check('Memo has a dedicated sidebar and editor', page.locator('.memo-sidebar').count() == 1 and page.locator('#dialog .dialog-head').count() == 0)
            page.screenshot(path=str(args.output / 'live-memo.png'), animations='disabled')
            close()
            page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).items.some(i=>i.widget==="memo" && i.data.entries.some(e=>e.title==="Live verification"))', arg=key)
            page.reload(wait_until='domcontentloaded')
            page.locator('[data-widget=memo]').wait_for()
            check('Language, scaling and memo survive reload', page.locator('html').get_attribute('lang') == 'zh-CN' and 'Live verification' in page.locator('[data-widget=memo]').inner_text() and page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).settings.dialogScale', key) == 125)
            page.locator('[data-widget=weather] [data-action=widget-config]').click()
            check('Published weather has city search and independent temperature units', page.locator('#city-query').count() == 1 and page.locator('[name=unit] option').count() == 2)
            close()
            check('No uncaught JavaScript exceptions', not errors)
            report['page_errors'] = errors
            report['result'] = 'passed'
        finally:
            context.close()
            browser.close()
finally:
    save_report()
print(json.dumps(report, ensure_ascii=False, indent=2))
