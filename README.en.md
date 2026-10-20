<p align="center">
  <img src="icons/qiye-icon.svg" alt="Qiye" width="88" height="88">
</p>

<h1 align="center">Qiye</h1>

<p align="center"><strong>A new tab for productivity and personalization</strong></p>
<p align="center">Flexible layouts · Multiple search engines · Extensible widgets · WebDAV sync</p>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <a href="https://ktclat.github.io/qiye/">Live demo</a> ·
  <a href="https://github.com/Ktclat/qiye/releases">Download</a> ·
  <a href="docs/README.en.md">Documentation</a> ·
  <a href="docs/wiki/Home-en.md">Widget wiki</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

Qiye is an open-source new tab extension for Chrome and Edge, bringing website shortcuts, multiple search engines and an extensible widget library into one place for work and everyday browsing. Organize content into groups, arrange cards by dragging, choose widget sizes and customize themes to create a browser desktop that fits your workflow.

Desktop content and settings are stored in your browser, with JSON backup and restore and optional synchronization across devices through a WebDAV service. The extension, web app and standalone preview share the same core code; browser integration and network access depend on the environment, as outlined below.

## Highlights

| Capability | What you can do |
| --- | --- |
| Desktop organization | Organize websites and widgets with groups, folders and multiple card sizes; drag to reorder, move between groups, use keyboard controls and undo changes |
| Search and navigation | Switch between built-in or custom search engines and find desktop content; search bookmarks and history with optional permissions, and save pages from the toolbar or context menu |
| Widget library | Enable widget sources to add notes, tasks, calendars, weather, focus timers and other tools; official widgets are maintained independently in [qiye-widgets](https://github.com/Ktclat/qiye-widgets) |
| Themes and wallpapers | Light/dark themes, accent colors, translucent surfaces and layout settings; local image/video wallpapers, online galleries and a local wallpaper library |
| Image processing | Compress wallpaper uploads locally when useful; the separate Image Compressor widget provides batch processing and format conversion |
| Backup and sync | Local storage, JSON import/export and WebDAV sync with revision and conflict checks |
| Community and sharing | Subscribe to widget catalogs, run web widgets in isolated frames, and preview and import shared desktop layouts |
| Interface languages | Use Simplified Chinese or English, selected automatically or manually, while preserving user-created content |

## Quick start

### Install in Chrome or Edge

1. Download `qiye-X.Y.Z-chrome-edge.zip` from [Releases](https://github.com/Ktclat/qiye/releases) and extract it.
2. Open `chrome://extensions/` or `edge://extensions/` and enable **Developer mode**.
3. Choose **Load unpacked** and select the directory that directly contains `manifest.json`.
4. Open a new tab. Click the Qiye icon in the navigation to open settings, or **＋** to add websites.
5. To add widgets, enable the built-in official source under **Settings → Widget sources**, then open **Add → Widgets** to choose a widget, preview it and select its size.

Widget sources are disabled by default and can be enabled as needed. Disabling a source preserves existing widget instances and data.

**Updating an existing installation:** packages use a fixed extension ID starting with 0.10.10. When migrating from 0.10.9 or older, export your desktop in the old installation first, import and verify it in the new one, then remove an old copy. For subsequent updates, replace files in the original folder and click **Reload**. Read [Installing and updating Qiye](UPDATING.md) before upgrading.

No Node.js, npm dependencies or build step is needed to use the extension. The manifest requires Chrome 116 or later; Qiye targets Chrome and Edge and has not been adapted for Firefox. Change the interface language in **Settings → Opening behavior → Language**.

### Try the web app

Open the [live demo](https://ktclat.github.io/qiye/) or download the standalone preview HTML from Releases. The web app and extension use the same production code, with separate data for each browser origin.

| Capability | Extension | Web / standalone HTML |
| --- | --- | --- |
| Desktop, widgets, appearance and JSON backups | Supported | Supported |
| New-tab replacement, toolbar and context-menu saving | Supported | Open manually; no extension APIs |
| Browser bookmarks and history | Optional permissions | No extension APIs |
| Cross-origin WebDAV and community catalogs | Site permissions requested when needed | Server must allow CORS |

Local HTML persistence also depends on the browser's file policy. Installation, upgrades and data transfer are covered in the [user guide (Chinese)](docs/GUIDE.md).

## Data and privacy

Desktop content is stored locally by default. WebDAV credentials stay in the current browser and are excluded from desktop JSON backups; synchronization requires your own server configuration. Website icons, weather, online wallpapers and community webpages contact their respective providers. See the [privacy policy (Chinese)](docs/PRIVACY.md) for triggers and permissions.

Widgets run in isolated frames only while their source is enabled. Disabling the source keeps instance data. Widget network requests follow normal web CORS rules.

## Documentation

| Topic | Guide |
| --- | --- |
| Settings, shortcuts and WebDAV | [User guide (Chinese)](docs/GUIDE.md) |
| Widget architecture, native API and community SDK | [English wiki](docs/wiki/Home-en.md) · [中文 Wiki](docs/wiki/Home.md) |
| Scope and privacy | [Product scope (Chinese)](docs/FEATURES.md) · [Privacy (Chinese)](docs/PRIVACY.md) |
| Development, testing and contributions | [Development (Chinese)](docs/DEVELOPMENT.md) · [Contributing (Chinese)](CONTRIBUTING.md) |
| Icons, wallpapers and translation | [Icons](docs/FAVICONS.md) · [Wallpapers](docs/WALLPAPERS.md) · [Internationalization](docs/I18N.md) (Chinese) |
| Version history, releases and verification | [Changelog (Chinese entries)](CHANGELOG.md) · [Releases](docs/RELEASES.md) · [QA](docs/QA.md) (Chinese) |

The [documentation index](docs/README.en.md) identifies the language of each guide.

## Development

Qiye uses HTML, CSS and JavaScript ES Modules. Load the repository root as an unpacked extension. CI uses Node.js 22 and Python 3.13.

This repository maintains the desktop, windows, themes, host API and settings. Widget implementations are developed, tested and released independently in [qiye-widgets](https://github.com/Ktclat/qiye-widgets). See [repository boundaries and protocol](docs/PLUGIN-API.md).

```sh
git clone https://github.com/Ktclat/qiye.git
cd qiye
npm test
python scripts/build-preview.py
```

Edit `index.html`, styles and `src/`, then regenerate `Qiye-preview.html`. See the [development guide (Chinese)](docs/DEVELOPMENT.md) for source structure and testing, and [Pages deployment (Chinese)](docs/DEPLOYMENT.md) for publishing the web app.

## Contributing

[Issues](https://github.com/Ktclat/qiye/issues) and pull requests are welcome. Include your browser, whether you use the extension or web app, reproduction steps and observed behavior. Widget authors can start with [native widgets](docs/wiki/Native-Widgets-en.md) or [community widgets](docs/wiki/Community-Widgets-en.md). Contribution rules are in [CONTRIBUTING.md (Chinese)](CONTRIBUTING.md).

## License

Copyright © 2026 Ktclat and Qiye contributors. Qiye is licensed under [GPL-3.0-only](LICENSE). Fonts, the calendar engine and external assets are subject to their respective licenses. Sources, license details and acknowledgments are listed in [third-party notices](docs/THIRD_PARTY.md).
