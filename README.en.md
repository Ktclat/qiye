<p align="center">
  <img src="icons/qiye-icon.svg" alt="Qiye" width="88" height="88">
</p>

<h1 align="center">Qiye</h1>

<p align="center"><strong>A familiar place, every time you open a tab.</strong></p>
<p align="center">A customizable new tab · Local storage · Your own WebDAV sync</p>

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

Qiye brings websites, search, everyday widgets and wallpapers together on your browser's new tab. Organize groups, choose card sizes and customize the layout in Chrome or Edge. No Qiye account is required: your desktop stays in your browser, with JSON backups and optional synchronization through your own WebDAV server.

> Qiye is in active development. Data formats may change, and older formats are not migrated. Read the [installation and upgrade guide (Chinese)](docs/GUIDE.md#安装与更新) before upgrading.

## Highlights

| Capability | What you can do |
| --- | --- |
| Flexible desktop | Arrange websites, folders and widgets; move between groups, use keyboard controls and undo changes |
| 14 everyday widgets | Weather, calendar, memos, sticky notes, to-dos, focus, countdown, workday countdown, habits, clocks, quotes, calculator, wallpapers and trending-page links |
| Search and browser integration | Built-in and custom search engines, local search, optional bookmarks/history access, toolbar and context-menu saving |
| Appearance | Light/dark themes, accent colors, translucent materials, local image/video wallpapers, online galleries and layout settings |
| Your data | Local storage, JSON import/export and WebDAV sync with revision and conflict checks |
| Community and sharing | Subscribe to widget catalogs, run isolated web widgets, preview and import shared desktop layouts |
| Chinese and English | Follow the browser language or select one manually; your own names and notes stay unchanged |

Built-in widgets support `1×1`, `1×2`, `2×1`, `2×2` and `4×2`. Weather requires opt-in network access; trending widgets link to platform pages. Official mainland China holidays and adjusted working days currently cover 2026. See the [widget overview](docs/wiki/Widgets-Overview-en.md) and [product scope (Chinese)](docs/FEATURES.md).

## Quick start

### Install in Chrome or Edge

1. Download `qiye-X.Y.Z-chrome-edge.zip` from [Releases](https://github.com/Ktclat/qiye/releases) and extract it.
2. Open `chrome://extensions/` or `edge://extensions/` and enable **Developer mode**.
3. Choose **Load unpacked** and select the directory that directly contains `manifest.json`.
4. Open a new tab. Click the Qiye icon in the navigation to open settings, or **＋** to add websites and widgets.

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

Community widgets load after you click **Run** in their detail window. The host API exposes only their own data. Public layout exports clear personal widget content but keep the website names and URLs you choose to share. See [community widgets](docs/wiki/Community-Widgets-en.md) and [layout sharing (Chinese)](docs/COMMUNITY.md).

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

Copyright © 2026 Ktclat and Qiye contributors. Qiye is licensed under [GPL-3.0-only](LICENSE). Fonts, the calendar engine and external assets retain their own licenses; see [third-party notices](docs/THIRD_PARTY.md). Interactions take inspiration from iTab; Qiye's branding, interface icons and code are independently implemented.
