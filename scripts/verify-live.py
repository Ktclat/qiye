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
widget_count=int(subprocess.check_output(['node','--input-type=module','-e',"import {listWidgetDefinitions} from './src/widget-registry.js';console.log(listWidgetDefinitions().length)"],cwd=ROOT,text=True).strip())
report = {'url':args.url, 'version':version, 'api_mocks':False, 'assets':{}, 'checks':[]}


def check(name, condition):
    assert condition, name
    report['checks'].append(name)


def save_report():
    (args.output / 'public-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


try:
    community_assets=sorted(path.relative_to(args.expected).as_posix() for path in (args.expected/'community').rglob('*') if path.is_file())
    icon_assets=sorted(path.relative_to(args.expected).as_posix() for path in (args.expected/'icons').rglob('*') if path.is_file())
    for path in ['index.html', *icon_assets, 'LICENSE', *community_assets]:
        request = urllib.request.Request(args.url + ('' if path == 'index.html' else path), headers={'Cache-Control':'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            report['assets'][path] = {'status':response.status, 'url':response.url, 'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw)}
        expected = (args.expected / path).read_bytes()
        if path.endswith(('.html','.js','.json','.svg')):
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
            page.locator('#engine-button').click()
            check('Published search menu is above widgets', page.locator('#engine-menu button').evaluate_all('ns=>ns.length>0&&ns.every(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})'))
            page.screenshot(path=str(args.output / 'live-search-menu.png'), animations='disabled')
            page.locator('#engine-menu [data-engine=google]').click()
            page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).settings.searchEngine==="google"', arg=key)
            check('Published search engine selection persists', page.locator('#engine-menu').is_hidden())
            page.locator('#brand-button').click()
            check('Settings show the manifest version', version in page.locator('.settings-nav').inner_text())
            check('Settings default to a right drawer', page.locator('#dialog').evaluate('n=>n.classList.contains("settings-drawer")'))
            page.locator('[data-preference=language]').select_option('zh-CN')
            page.wait_for_function('document.querySelector("#workspace-title")?.textContent === "设置"')
            page.locator('[data-settings-tab=appearance]').click()
            check('Window size and presentation controls are published', page.locator('[data-preference=windowSize] option').count() == 4 and page.locator('[data-preference=settingsPresentation] option').count() == 2)
            page.locator('[data-preference=windowSize]').select_option('125')
            page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).settings.windowSize===125', arg=key)
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
            check('Language, window size and memo survive reload', page.locator('html').get_attribute('lang') == 'zh-CN' and 'Live verification' in page.locator('[data-widget=memo]').inner_text() and page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).settings.windowSize', key) == 125)
            page.locator('[data-widget=weather] [data-action=widget-config]').click()
            check('Published weather has city search and independent temperature units', page.locator('#city-query').count() == 1 and page.locator('[name=unit] option').count() == 2)
            close()
            weather_id=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).items.find(i=>i.widget==="weather").id',key)
            page.locator(f'#desktop [data-item="{weather_id}"]').focus();page.keyboard.press('Enter')
            check('Published weather opens its dedicated canvas',page.locator('.weather-app').count()==1 and page.locator('.utility-layout').count()==0)
            page.locator('[data-detail-action=weather-cities]').click()
            check('Published weather city list shows current city',page.locator('.weather-city-card.active').count()==1)
            page.keyboard.press('Escape');page.locator('[data-detail-action=weather-settings]').first.click()
            check('Published weather settings are in a separate drawer',page.locator('#weather-settings-panel').is_visible() and page.locator('#weather-settings [name=unit] option').count()==2)
            page.keyboard.press('Escape');page.locator('[data-detail-action=weather-enable]').click()
            page.wait_for_function('()=>document.querySelector(".weather-temperature") || (document.querySelector("[data-detail-action=weather-refresh]")&&!document.querySelector("[data-detail-action=weather-refresh]").disabled)',timeout=25000)
            available=page.locator('.weather-temperature').count()==1
            report['weather_provider']='available' if available else page.locator('.weather-empty-state').inner_text()
            if available:
                check('Live weather provider supplies both forecast charts',page.locator('.hourly-weather>div').count()==24 and page.locator('.daily-weather>div').count()==7)
                page.locator('[data-weather-metric=wind]').click()
                check('Published hourly wind chart is interactive','km/h' in page.locator('.weather-chart-caption').inner_text())
            else:
                check('Unavailable weather provider shows a retry action',page.locator('[data-detail-action=weather-refresh]').is_enabled())
            page.screenshot(path=str(args.output/'live-weather.png'),animations='disabled');close()
            page.locator('.top-tools [data-action=add]').click()
            check('Published chooser has previews and website navigation', page.locator('[data-catalog-card]').count() == widget_count and page.locator('[data-add-tab=sites]').count() == 1)
            page.locator('[data-catalog-widget=converter] [data-catalog-size="1x1"]').click()
            page.locator('[data-add-widget=converter]').click()
            page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0')
            check('Published chooser remains open after adding', page.locator('#dialog').is_visible())
            close()
            page.locator('[data-widget=converter] [data-action=widget-open]').click()
            page.locator('#cv-expression').fill('6*7')
            page.locator('#cv-expression').press('Enter')
            check('Published compact calculator opens a working detail view', page.locator('#cv-expression').input_value() == '42')
            close()
            page.locator('#desktop [data-item=site-github]').click(button='right')
            page.locator('#context-menu [data-context=edit]').click()
            check('Published website editor has the visit fallback', page.locator('[data-action=visit-favicon]').inner_text() == '访问网站')
            check('Published web fallback explains tab access and retains upload', '网页版可上传本机图片' in page.locator('.visit-icon-control').inner_text() and page.locator('[data-icon-choice=upload]').is_visible())
            page.screenshot(path=str(args.output / 'live-icon-visit.png'), animations='disabled')
            close()
            page.locator('#desktop [data-item=countdown-home]').focus();page.keyboard.press('Enter')
            check('Published countdown has categories, events and details',page.locator('.countdown-categories').count()==1 and page.locator('.countdown-event').count()>=1 and page.locator('.countdown-detail').count()==1)
            page.locator('[data-life-action=countdown-edit]').click()
            check('Published countdown opens its event editor',page.locator('[data-life-form=countdown] [name=date]').is_visible())
            page.keyboard.press('Escape')
            page.screenshot(path=str(args.output / 'live-countdown.png'),animations='disabled');close()
            for kind,selector in [('clock','.world-clock-cities'),('habit','.habit-week-heading')]:
                page.locator('.top-tools [data-action=add]').click();page.locator(f'[data-add-widget={kind}]').click()
                page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0');close()
                page.locator(f'#desktop [data-widget={kind}] [data-action=widget-open]').last.click()
                check(f'Published {kind} uses its dedicated interface',page.locator(selector).is_visible())
                close()
            page.locator('.top-tools [data-action=add]').click();page.locator('[data-add-tab=sharing]').click()
            with page.expect_download() as download:page.locator('[data-layout-export] button').click()
            layout_path=args.output/'layout.json';download.value.save_as(layout_path)
            shared=json.loads(layout_path.read_text(encoding='utf-8'))
            check('Public layout export excludes memo content',shared['format']=='qiye-layout' and 'Temporary browser profile only' not in json.dumps(shared) and all('data' not in item for item in shared['items']))
            before=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).groups.length',key)
            page.locator('[data-layout-file]').set_input_files(layout_path);page.locator('[data-layout-apply] button').click();page.locator('[data-layout-undo]').wait_for()
            check('Published import appends new groups',page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).groups.length',key)==before+1)
            page.locator('[data-layout-undo]').click();page.wait_for_function('([key,count])=>JSON.parse(localStorage.getItem(key)).groups.length===count',arg=[key,before]);check('Published import can be undone',True)
            page.locator('[data-add-tab=community]').click();page.locator('[data-community-source] button').click();page.locator('[data-community-card]').first.wait_for(timeout=25000)
            check('Public community directory loads without mocks',page.locator('[data-community-card]').count()>=1)
            page.locator('[data-community-card]').first.locator('[data-community-size]').select_option('1x1');page.locator('[data-community-add]').first.click();page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).items.some(i=>i.widget==="community")',arg=key);close()
            item_id=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).items.find(i=>i.widget==="community").id',key)
            page.locator(f'#desktop [data-item="{item_id}"]').focus();page.keyboard.press('Enter');page.locator('[data-community-run]').click();page.wait_for_function('()=>document.querySelector("[data-community-status]").textContent==="组件正在运行"',timeout=25000)
            page.frame_locator('.community-frame-host iframe').locator('#increase').click();page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).items.find(i=>i.widget==="community").data.value===\'{"count":1}\'',arg=key)
            check('Published isolated example runs and persists its counter',True);page.screenshot(path=str(args.output/'live-community.png'),animations='disabled');close()
            check('No uncaught JavaScript exceptions', not errors)
            report['page_errors'] = errors
            report['result'] = 'passed'
        finally:
            context.close()
            browser.close()
finally:
    save_report()
print(json.dumps(report, ensure_ascii=False, indent=2))
