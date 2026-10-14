# Qiye

[简体中文](README.md) · [Try the web app](https://ktclat.github.io/qiye/) · [Download releases](https://github.com/Ktclat/qiye/releases)

Qiye is an account-free, customizable new tab for Chrome and Edge. Organize websites, folders and everyday widgets, use your own wallpaper, and optionally sync through your own WebDAV server. Personal content stays in your browser unless you export it or enable synchronization.

Version **0.9.1** supports English and Simplified Chinese. It follows your browser language by default. Click the Qiye logo, then **Opening behavior → Language**, to change it. Interface text changes immediately; your own names and notes are preserved.

Version 0.9.1 adds a dedicated weather canvas with hourly temperature / precipitation / wind curves, seven-day high and low curves, city search and a recent-city list. Up to 8 cities are remembered on this device, outside backups and WebDAV. Weather settings live in a drawer; light / dark themes, mobile layouts and °C / °F remain supported.

Version 0.9.0 fixes wallpaper dragging and opens every wallpaper size directly in the wallpaper centre. Countdown, workday, focus, weather and utility widgets now have dedicated workspaces with relevant settings and controls.

**Add → Community** accepts public directories or author manifests. Review the source and size, then add the widget; an isolated webpage runs only after you click Run in its detail window. A working counter example and SDK are included. **Add → Share and import** exports selected groups without personal widget content, supports JSON URLs and files, previews imports, merges or creates groups, skips duplicate URLs and offers undo. Host your JSON file to generate a share link. [Author guide and formats](docs/COMMUNITY.md).

The search engine dropdown and search suggestions now appear above desktop widgets, including when the clock and search bar are pinned independently. The same fix ships in the extension and web app, with checks for both themes, narrow screens, editing and minimal mode.

Website icons now default to their original outline with no added background. Choose rounded frames or an adaptive background explicitly in icon settings.

If direct icon extraction fails, choose **Visit to get icon** in the website editor. Wait for the visited tab to show its icon, then return to Qiye. Select the new **Tab icon** candidate and save. The extension reads its browser favicon cache and stores a portable PNG; the selected image no longer needs the site's cookies or image server. This reuses the existing `favicon` permission without adding `tabs`, history or script-injection access. Canceling, changing the URL, closing the editor or a two-minute timeout stops the operation. Generic browser fallback icons are rejected. The web version explains its limitation and offers visiting the site or uploading an image; captured images already saved in a current-format backup also work on the web.

## Everyday widgets

- **Calendar:** a wide desktop card and a dedicated calendar app with separate calendar / tools tabs, year and month selectors, lunar almanac details, a yearly festival timeline, date addition / subtraction, today, optional Chinese lunar dates, Monday / Sunday week start, day-of-year and ISO week, per-date events, and a date / workday calculator. Workday intervals exclude the start date and include the end date. Calendar data is bundled offline using the pinned MIT-licensed lunar-javascript engine; traditional almanac entries are cultural reference data. Official mainland China holidays and adjusted working days are provided for **2026 only**. Other regions can use weekdays without a statutory holiday calendar.
- **Memos:** a dedicated left-list / right-editor workspace with edit / creation timestamps, maximize and mobile list switching; multiple entries with titles and plain text, full-text search, pinning, recent / title sorting, autosave, delete with undo and TXT export. A failed save keeps the draft in the current page; retry or export before reloading.
- **Weather:** independent city and °C / °F settings per card, worldwide city search, current observations, 24-hour and 7-day forecasts, precipitation probability, feels-like temperature, wind, humidity, UV, sunrise / sunset, US AQI and PM2.5. Enable network access for each weather card. Data comes from Open-Meteo / CAMS; missing measurements remain unknown, and failed requests keep cached forecasts.
- **Other widgets:** quick sticky notes, to-dos, focus timer, countdown, workday countdown, habits, quotes, world clocks, calculator, wallpaper gallery and links to trending pages.

Windows can be sized to 75%, 100%, 125% or 150% without zooming text or controls in **Settings → Theme & materials**. Light / dark themes, keyboard access and narrow layouts are supported. The implementation is independent and takes interaction references from iTab; it does not use iTab private APIs or claim complete feature parity.

## Install

1. Download `qiye-0.8.1-chrome-edge.zip` from Releases and extract it.
2. Open `chrome://extensions/` or `edge://extensions/`, enable Developer mode and choose **Load unpacked**.
3. Select the folder containing `manifest.json`, then open a new tab.

The standalone preview HTML and the public website use the same production modules. Each browser origin keeps separate local data. JSON export / import and your own WebDAV service can transfer the current format. The project is pre-release: only **schema 5** is accepted, with no migration or compatibility for earlier versions.

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


## 0.7.0 desktop interactions

Hold a card or widget button for 320 ms to drag; short clicks retain their actions. All built-in widgets support 1×1, 1×2, 2×1, 2×2 and 4×2. Compact tiles open the full interactive view. Settings open as a right drawer by default; choose a centered window in Appearance (applied next time). In v0.8.0, window sizing replaces UI zoom. The redesigned chooser includes previews, search, categories and target groups. The context menu retains its commands with a subtle spring animation. See [Widget API v3](docs/WIDGETS.md) for third-party development and marketplace preparation.

## 0.8.0 layouts and themes

The desktop and chooser share exact grid dimensions: 60×60, 60×150, 150×60, 150×150 and 330×150 CSS pixels at the default settings on a desktop viewport. Labels sit in the 30 px gap. Small viewports reduce these dimensions, with a minimum 48 px cell. Each built-in widget uses distinct compact, portrait, landscape and wide layouts; the wide countdown includes a target-date sheet.

Every chooser card has independent previous / next controls and accessible size dots. Adding a widget uses its current preview size. Previews are inert, use the production renderer and never mount or request data. Window presets resize available space while the content reflows. A single **Use accent color everywhere** switch covers the clock, navigation, buttons and widget controls. Native select menus have explicit light and dark palettes.

[Widget API v3](docs/WIDGETS.md) gives extensions their own renderer and lifecycle at every declared size, including 1×1. Only the current API and schema are accepted; there are no migrations.
