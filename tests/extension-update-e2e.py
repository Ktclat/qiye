"""Real Chromium installation: stable identity, replacement and storage retention."""
import json
from pathlib import Path
import tempfile
import zipfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/extension-update'
OUT.mkdir(parents=True, exist_ok=True)
VERSION = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
EXPECTED_ID = json.loads((ROOT / 'extension-identity.json').read_text())['id']
ZIP = ROOT / f'dist/qiye-{VERSION}-chrome-edge.zip'
report = {'checks': [], 'id': EXPECTED_ID}


def check(name, value):
    assert value, name
    report['checks'].append(name)
    print('PASS', name, flush=True)


with tempfile.TemporaryDirectory(prefix='qiye-update-regression-') as directory, sync_playwright() as pw:
    temporary = Path(directory)
    copies = {}
    for name in ['legacy-a', 'legacy-b', 'fixed-a', 'fixed-b']:
        target = temporary / name
        with zipfile.ZipFile(ZIP) as package:
            package.extractall(target)
            check('Update guide in ' + name, 'UPDATING.md' in package.namelist())
        manifest = json.loads((target / 'manifest.json').read_text())
        if name.startswith('legacy'):
            manifest.pop('key')
        if name.endswith('b'):
            parts = [int(part) for part in VERSION.split('.')]
            parts[-1] += 1
            manifest['version'] = '.'.join(map(str, parts))
        (target / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        copies[name] = target
    context = pw.chromium.launch_persistent_context(
        str(temporary / 'profile'), channel='chromium', headless=True, locale='zh-CN',
        viewport={'width': 1440, 'height': 960}, ignore_default_args=['--disable-extensions'],
        args=['--enable-unsafe-extension-debugging'])
    context.route('https://**/*', lambda route: route.fulfill(status=200, content_type='application/json', body='{}'))
    session = context.browser.new_browser_cdp_session()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        legacy_ids = [session.send('Extensions.loadUnpacked', {'path': str(copies[name])})['id']
                      for name in ['legacy-a', 'legacy-b']]
        check('Reproduces duplicate IDs in old keyless packages', legacy_ids[0] != legacy_ids[1])
        page.goto(f'chrome-extension://{legacy_ids[0]}/index.html')
        page.locator('#desktop .tile-link').first.wait_for()
        page.locator('#brand-button').click()
        page.locator('[data-settings-tab=about]').click()
        expect(page.locator('.extension-update')).to_contain_text('此安装使用旧标识')
        check('Legacy installation displays backup-first guidance', True)
        page.close()

        installed = session.send('Extensions.loadUnpacked', {'path': str(copies['fixed-a'])})
        check('Packaged public key gives permanent ID', installed['id'] == EXPECTED_ID)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'chrome-extension://{EXPECTED_ID}/index.html')
        page.locator('#desktop .tile-link').first.wait_for()
        page.locator('#engine-button').click()
        page.locator('#engine-menu [data-engine=google]').click()
        page.wait_for_function("async()=> (await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']?.settings.searchEngine==='google'")
        before = page.evaluate("async()=> (await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']")
        page.evaluate("""async()=>{
          localStorage.setItem('qiye.identity-probe','preserved');
          await chrome.storage.local.set({'qiye.plugin-probe':{value:'preserved'}});
          await new Promise((resolve,reject)=>{
            const request=indexedDB.open('qiye-update-probe',1);
            request.onupgradeneeded=()=>request.result.createObjectStore('values');
            request.onerror=()=>reject(request.error);
            request.onsuccess=()=>{
              const db=request.result,transaction=db.transaction('values','readwrite');
              transaction.objectStore('values').put('preserved','value');
              transaction.oncomplete=()=>{db.close();resolve();};
              transaction.onerror=()=>reject(transaction.error);
            };
          });
        }""")
        page.close()
        updated = session.send('Extensions.loadUnpacked', {'path': str(copies['fixed-b'])})
        check('Different directory and version replace the same identity', updated['id'] == EXPECTED_ID)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'chrome-extension://{EXPECTED_ID}/index.html')
        page.locator('#desktop .tile-link').first.wait_for()
        after = page.evaluate("async()=> (await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']")
        if before != after:
            comparison = {'before': before, 'after': after}
            (OUT / 'storage-comparison.json').write_text(json.dumps(comparison, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Storage differences:', {key: {'before': before.get(key), 'after': after.get(key)}
                  for key in before.keys() | after.keys() if before.get(key) != after.get(key)}, flush=True)
        check('Desktop and settings survive updating', before == after)
        check('Extension storage survives updating', page.evaluate("async()=> (await chrome.storage.local.get('qiye.plugin-probe'))['qiye.plugin-probe'].value") == 'preserved')
        check('Local storage survives updating', page.evaluate("localStorage.getItem('qiye.identity-probe')") == 'preserved')
        check('IndexedDB survives updating', page.evaluate("""()=>new Promise((resolve,reject)=>{
          const request=indexedDB.open('qiye-update-probe',1);
          request.onerror=()=>reject(request.error);request.onsuccess=()=>{
            const db=request.result,result=db.transaction('values').objectStore('values').get('value');
            result.onsuccess=()=>{db.close();resolve(result.result);};result.onerror=()=>reject(result.error);
          };
        })""") == 'preserved')
        check('New version was actually loaded', page.evaluate("chrome.runtime.getManifest().version") == json.loads((copies['fixed-b'] / 'manifest.json').read_text())['version'])
        page.locator('#brand-button').click()
        page.locator('[data-settings-tab=about]').click()
        panel = page.locator('.extension-update')
        expect(panel).to_contain_text('此安装使用固定标识')
        panel.locator('summary').first.click()
        for theme, width in [('dark', 1440), ('light', 1440), ('dark', 390)]:
            page.set_viewport_size({'width': width, 'height': 960})
            page.evaluate("theme=>document.documentElement.dataset.theme=theme", theme)
            panel.scroll_into_view_if_needed()
            check(f'Update panel has no horizontal overflow: {theme} {width}',
                  panel.evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
            page.screenshot(path=str(OUT / f'{theme}-{width}.png'))
        with page.expect_download() as download:
            panel.locator('[data-action=export]').click()
        backup = OUT / 'desktop-backup.json'
        download.value.save_as(backup)
        check('Upgrade panel exports the existing desktop', json.loads(backup.read_text(encoding='utf-8'))['settings']['searchEngine'] == 'google')
        panel.locator('[data-action=open-backup]').click()
        expect(page.locator('[data-settings-tab=data]')).to_have_attribute('aria-current', 'page')
        check('Recovery entry opens backup settings', True)
        manager = context.new_page()
        manager.goto('chrome://extensions/')
        expect(manager.locator('extensions-item')).to_have_count(3)
        expect(manager.locator(f'extensions-item[id="{EXPECTED_ID}"]')).to_have_count(1)
        check('One fixed-ID extension; legacy installations remain untouched', True)
        manager.screenshot(path=str(OUT / 'extension-identities.png'))
        check('No page errors', not errors)
    finally:
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        context.close()
