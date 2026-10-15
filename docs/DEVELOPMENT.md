# 开发指南

[贡献约定](../CONTRIBUTING.md) · [文档索引](README.md) · [组件开发](wiki/Home.md)

项目使用原生 HTML、CSS 和 JavaScript ES Modules，无需安装运行时依赖；历法引擎随源码离线提供。加载扩展后修改源码，在扩展管理页重新加载即可查看更新。

运行逻辑测试使用支持内置测试运行器与 Web Crypto 的 Node.js（建议 Node.js 22 或更新版本）；生成独立预览需要 Python 3。以下命令均在仓库根目录执行：

```sh
# 运行自动化测试，无需 npm install
npm test

# 将同一份生产模块与样式内联为独立 HTML
python3 scripts/build-preview.py

# 将演示网页生成到 gh-pages 分支的独立检出目录
python3 scripts/build-pages.py /path/to/qiye-demo

# 可选：通过本地 HTTP 服务打开 index.html 进行网页调试
python3 -m http.server 8000 --bind 127.0.0.1
```

启动本地服务后访问 `http://127.0.0.1:8000/`。网页调试不提供扩展专属接口；这些功能需要加载扩展验证。

`Qiye-preview.html` 是生成文件，**请修改源文件后重新生成**。它由 `index.html`、CSS 和 `src/` 中的生产模块构建，不单独维护第二套界面逻辑。

品牌图标的唯一源图是 `icons/qiye-icon.svg`，页面与文档直接引用 SVG。修改源图后，运行 `python3 scripts/build-icons.py` 更新扩展使用的 16、32、48、128 像素 PNG，再重新生成预览。图标生成复用浏览器测试所需的 Playwright 1.56.0 和 Chromium；首次使用可运行 `python3 -m pip install playwright==1.56.0` 与 `python3 -m playwright install chromium`，已有浏览器也可通过 `CHROMIUM_PATH` 指定。独立预览会内嵌品牌图标，下载后无需附带 `icons/` 目录。

网页发布同样从 `main` 中的生产源码构建，但生成文件须提交并推送到 **`gh-pages`**。仅推送 `main` 不会更新演示页面。请将 `/path/to/qiye-demo` 替换为 `gh-pages` 的独立检出目录，首次准备 worktree 或启用 Pages 的步骤见 [部署指南](DEPLOYMENT.md)。

## 源码结构

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | Manifest V3、权限、新标签页入口与快捷键 |
| `index.html`、`styles.css` | 页面结构与桌面样式 |
| `src/app.js` | 桌面交互、弹层、布局与保存流程 |
| `src/core.js` | 共享状态、持久化、备份校验及浏览器数据接口 |
| `src/bookmarks.js`、`src/bookmarks-view.js`、`src/bookmarks-workspace.js`、`src/bookmarks.css` | 独立收藏校验、原生书签权限与 CRUD、左右分栏文件夹树及组件卡片 |
| `src/drag.js` | 实时 DOM 重排、FLIP 动画、稳定指针捕获、键盘排序和取消恢复 |
| `src/icon-artwork.js`、`src/site-icon-catalog.js` | ICO 原生帧恢复、本机缓存与已核验首方地址 |
| `src/desktop.css` | 分离滚动/固定区域、统一网站图标和组件比例、添加面板 |
| `src/favicons.js` | 网站图标候选、尺寸与清晰度判断、有限升级、网页与清单提取、按需权限及本机缓存 |
| `src/tab-favicon.js` | 用户主动访问、返回检测、浏览器图标缓存读取、取消与有界重试；不依赖后台常驻任务 |
| `src/keyed-view.js` | 按稳定键复用卡片与图片节点，仅创建、移动或移除发生变化的项 |
| `src/favicon-view.js` | 共享 4 个请求槽、图片回退、有限清晰度升级和失效渲染取消 |
| `src/avatar.js` | 本地头像格式校验、解码、裁切与大小限制 |
| `src/search-history.js` | 可选的本机最近搜索记录与清除，不进入桌面备份 |
| `fonts/`、`docs/THIRD_PARTY.md` | 本地 Inter 可变字体、完整 OFL 许可与来源 |
| `src/widgets.js`、`src/widgets.css` | 内置卡片的渲染、交互与样式 |
| `src/calendar.js`、`src/memos.js`、`src/weather.js` | 日期 / 调休、多条备忘录与天气服务 |
| `src/widget-details.js`、`src/widget-workspaces.js`、`src/widget-drafts.js` | 详情交互、视图与可重试的独立草稿保存 |
| `src/i18n.js`、`src/messages-en.js`、`_locales/` | 运行时国际化与浏览器扩展元数据 |
| `src/widget-*.js` | 组件注册、配置表单、生命周期、独立数据与扩展示例 |
| `src/window-layout.js` | 窗口可用空间与视口边界 |
| `src/validation.js` | 共享数据校验 |
| `scripts/package-release.py`、`scripts/publish-release.py` | 分发打包与自动 Release |
| `src/wallpapers.js` | Picsum 请求、元数据校验、图库翻页与请求状态 |
| `src/webdav.js` | WebDAV 配置、条件请求、版本比较与同步协议 |
| `src/sync-ui.js`、`src/sync.css` | 同步设置、冲突确认与自动检查交互 |
| `src/icons.js`、`icons/` | 界面图标与栖页应用图标 |
| `background.js`、`popup.*` | 扩展菜单、快捷键与工具栏收藏入口 |
| `scripts/build-preview.py` | 生成独立 `Qiye-preview.html` |
| `scripts/build-pages.py` | 将相同生产模块生成为 `gh-pages` 分支的静态演示网页 |
| `.nojekyll`、`docs/DEPLOYMENT.md` | GitHub Pages 静态发布标记、启用与迁移指南 |
| `tests/` | 使用 Node.js 内置测试运行器的逻辑与集成测试 |
| `docs/` | 功能范围、隐私说明与验收记录 |
| `CONTRIBUTING.md` | 提交问题、开发验证与贡献约定 |

## 图标模块接口

`src/favicons.js` 与桌面状态分开管理图标缓存。渲染前可等待 `faviconCacheReady` 加载本机缓存；读取网页声明由明确的用户点击，或已开启的自动高清补充逻辑按需触发；新权限只能由主动操作申请。

| 接口 | 返回值与用途 |
| --- | --- |
| `getFaviconCandidates(siteUrl, { targetSize, pixelRatio })` | 同步返回按清晰度需求排序的候选 URL；不读取页面 HTML |
| `discoverFavicon(siteUrl, { requestPermission, force, targetSize, pixelRatio })` | 异步返回 `{ url, candidates, source, warning? }`；`url` 是首个候选，`source` 为 `html`、`manifest`、`cache` 或 `fallback` |
| `rememberFavicon(siteUrl, iconUrl, { width, height })` | 图片加载成功后记录地址和真实尺寸；浏览器内部图标 URL 不持久保存 |
| `getFaviconQuality(siteUrl, iconUrl, options)` | 根据实际尺寸、声明与目标显示尺寸评估候选 |
| `takeFaviconUpgradeCandidates(siteUrl, iconUrl, options)` | 在冷却与数量限制内领取更清晰的候选；函数本身不发网络请求 |

桌面里的 `iconMode` 仅允许 `auto` / `text`；显式选择的图标存入 `iconUrl`，允许经过校验的 HTTPS 图片地址或静态本地 PNG/JPEG/WebP。HTML、浏览器内部 URL 和自动缓存对象不写入桌面 JSON；自动图标缓存使用独立的 `qiye.favicons.local.v2` 记录。

外观、导航、布局、打开方式与头像均进入桌面设置，随 JSON 备份和 WebDAV 同步；最近搜索记录与图标缓存独立存储。当前数据格式为 `schemaVersion: 5`，导入、本机保存和 WebDAV 使用同一严格校验。设置及组件必需字段缺失、未知字段、非法类型/范围或不支持的组件尺寸均被拒绝；默认值仅用于创建新桌面或新卡片。

## 组件窗口布局约定

后续新增或调整的组件统一采用细窄单行标题栏，100% 比例下约 44–48 px，不使用大图标与粗大的标题横幅。上下分为标题栏和内容区；按功能需要，在标题栏左侧放来源或上下文切换，右侧依次放搜索、设置、放大、关闭。书签内容区保持左侧文件夹导航、右侧书签列表，说明与低频选项收进设置，保留键盘访问和窄屏可用性。

## 验证状态

验证包括 Node 逻辑、发布脚本、真实 HTTP 桌面 / 编辑器 / 组件交互，以及生产模块和独立网页的中英文日常组件回归。具体结果与实机边界见 [QA.md](QA.md)。

自动化测试使用受控网络、DOM 和存储替身运行生产函数；浏览器截图和交互记录只证明对应环境中的实际检查。Chrome / Edge 扩展实装和权限弹窗、触屏真机、真实 WebDAV 服务及完整网络链路的验收边界见 QA。文档中保留的 v0.2.2（149 项测试）及更早版本记录属于历史结果，不代替本轮验收。
