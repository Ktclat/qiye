# Qiye

[简体中文](README.md) · [Try the web app](https://ktclat.github.io/qiye/) · [Download releases](https://github.com/Ktclat/qiye/releases)

Qiye is an account-free, customizable new tab for Chrome and Edge. Organize websites, folders and everyday widgets, use your own wallpaper, and optionally sync through your own WebDAV server. Personal content stays in your browser unless you export it or enable synchronization.

Version **0.5.0** supports English and Simplified Chinese. It follows your browser language by default. Click the Qiye logo, then **Opening behavior → Language**, to change it. Interface text changes immediately; your own names and notes are preserved.

## Everyday widgets

- **Calendar:** month navigation, today, optional Chinese lunar dates, Monday / Sunday week start, day-of-year and ISO week, per-date events, and a date / workday calculator. Official mainland China holidays and adjusted working days are provided for **2026 only**. Other regions can use weekdays without a statutory holiday calendar.
- **Memos:** multiple entries with titles and plain text, full-text search, pinning, recent / title sorting, autosave, delete with undo and TXT export. A failed save keeps the draft in the current page; retry or export before reloading.
- **Weather:** independent city and °C / °F settings per card, worldwide city search, current observations, 24-hour and 7-day forecasts, precipitation probability, feels-like temperature, wind, humidity, UV, sunrise / sunset, US AQI and PM2.5. Enable network access for each weather card. Data comes from Open-Meteo / CAMS; missing measurements remain unknown, and failed requests keep cached forecasts.
- **Other widgets:** quick sticky notes, to-dos, focus timer, countdown, workday countdown, habits, quotes, world clocks, calculator, wallpaper gallery and links to trending pages.

Windows can be scaled from 75% to 150% in **Settings → Theme & materials**. Light / dark themes, keyboard access and narrow layouts are supported. The implementation is independent and takes interaction references from iTab; it does not use iTab private APIs or claim complete feature parity.

## Install

1. Download `qiye-0.5.0-chrome-edge.zip` from Releases and extract it.
2. Open `chrome://extensions/` or `edge://extensions/`, enable Developer mode and choose **Load unpacked**.
3. Select the folder containing `manifest.json`, then open a new tab.

The standalone preview HTML and the public website use the same production modules. Each browser origin keeps separate local data. JSON export / import and your own WebDAV service can transfer the current format. The project is pre-release: only **schema 3** is accepted, with no migration or compatibility for earlier versions.

Weather, wallpapers and site icons depend on external services. The web app is subject to browser CORS rules; optional extension permissions are requested for browser integrations and relevant site access. WebDAV credentials stay local and are not included in desktop backups. See the [privacy details](docs/PRIVACY.md).

## Develop

No runtime build or npm dependencies are needed to load the extension. Use Node.js 22 and Python 3 for verification and the standalone webpage:

```sh
npm test
python scripts/build-preview.py
python -m unittest discover -s tests -p release_test.py
python -m pip install playwright==1.56.0
python -m playwright install chromium
python tests/browser-e2e.py --output test-results
python tests/widgets-e2e.py --output test-results/widgets
python tests/daily-widgets-e2e.py
python tests/daily-widgets-e2e.py --preview
python tests/extension-e2e.py
python scripts/package-release.py
```

[Widget API](docs/WIDGETS.md) · [Translation guide](docs/I18N.md) · [Contributing](CONTRIBUTING.md) · [Releases](docs/RELEASES.md) · [Pages deployment](docs/DEPLOYMENT.md) · [Verification boundaries](docs/QA.md)

A new version pushed to `main`, or a matching version tag, triggers verification and a GitHub Release with extension, source, preview and checksum assets. Publish the generated website to `gh-pages` as part of every delivery; pushing source alone does not update the website.

Licensed under **GPL-3.0-only**. Included fonts, site icons and external images retain their respective licenses. Bundled source widgets must have compatible licenses; independent external services use their own terms.
