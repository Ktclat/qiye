<p align="center">
  <img src="icons/qiye-icon.svg" alt="栖页 Qiye" width="88" height="88">
</p>

<h1 align="center">栖页 Qiye</h1>

<p align="center"><strong>专注效率与个性化的浏览器新标签页</strong></p>
<p align="center">桌面编排 · 多引擎搜索 · 组件扩展 · WebDAV 同步</p>

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://ktclat.github.io/qiye/">在线体验</a> ·
  <a href="https://github.com/Ktclat/qiye/releases">下载扩展</a> ·
  <a href="docs/README.md">文档</a> ·
  <a href="docs/wiki/Home.md">小组件 Wiki</a> ·
  <a href="CHANGELOG.md">更新日志</a>
</p>

栖页（Qiye）是一款面向 Chrome 与 Edge 的开源新标签页扩展，集成网站导航、多引擎搜索与可扩展小组件，为工作和日常浏览提供统一入口。通过分组管理、拖拽编排、多尺寸卡片与主题定制，构建适合个人使用习惯的浏览器桌面。

桌面内容与设置默认保存在当前浏览器，支持 JSON 备份与恢复，并可连接 WebDAV 服务实现跨设备同步。扩展版、网页版与独立预览共用核心代码；浏览器集成能力与网络访问条件因运行环境而异，详见下方说明。

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 桌面组织 | 通过分组、文件夹与多尺寸卡片整理常用内容，支持拖拽排序、跨组移动、键盘操作与撤销 |
| 搜索与导航 | 切换内置或自定义搜索引擎，查找桌面内容；按需授权后检索浏览器书签与历史，支持工具栏和右键收藏 |
| 组件扩展 | 启用组件源后，按需添加便签、待办、日历、天气、专注计时等工具；官方组件由 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 独立维护 |
| 主题与壁纸 | 深浅主题、自定义主题色、半透明材质与布局设置；支持本地图片和视频壁纸、在线图库及本机壁纸库 |
| 图片处理 | 上传壁纸时按需进行本地压缩；独立图片压缩组件提供批量处理与格式转换 |
| 备份与同步 | 本地存储、JSON 导入导出，以及带版本与冲突检查的 WebDAV 同步 |
| 社区与分享 | 订阅组件目录，在隔离环境中运行网页组件，预览并导入公开桌面布局 |
| 界面语言 | 支持简体中文与英语，自动匹配浏览器语言或手动切换，保留用户自定义内容 |

## 快速开始

### 安装 Chrome / Edge 扩展

1. 从 [Releases](https://github.com/Ktclat/qiye/releases) 下载 `qiye-X.Y.Z-chrome-edge.zip` 并解压。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择直接包含 `manifest.json` 的目录。
4. 新建标签页，点击导航中的栖页图标打开设置，通过右上角 **＋** 添加网站。
5. 如需使用小组件，在**设置 → 组件源**启用预置的官方源，再从**添加 → 小组件**选择组件、预览并设置尺寸。

组件源默认关闭，由用户按需启用；停用来源后保留已有组件实例与数据。

**升级已有安装：** 0.10.10 起安装包固定扩展 ID。0.10.9 及更早版本需先在旧版导出桌面备份，在新版导入并核对后再移除旧安装；后续版本覆盖原安装目录并点击“重新加载”。请先阅读[安装与升级说明](UPDATING.md)，不要反复解压到新目录后当作新扩展添加。

使用扩展无需 Node.js、安装 npm 依赖或构建。Manifest 要求 Chrome 116 或以上；目前面向 Chrome / Edge，尚未适配 Firefox。语言可在**设置 → 打开方式 → 语言 / Language**切换。

### 体验网页版

打开[在线演示](https://ktclat.github.io/qiye/)，或下载 Release 中的独立预览 HTML。网页与扩展共用生产代码，每个浏览器来源独立保存数据。

| 能力 | 扩展 | 网页 / 独立 HTML |
| --- | --- | --- |
| 桌面、组件、外观与 JSON 备份 | 支持 | 支持 |
| 替换新标签页、工具栏与右键收藏 | 支持 | 需自行打开网页，无扩展接口 |
| 书签与浏览历史 | 按需授权 | 无扩展接口 |
| WebDAV、社区目录等跨域请求 | 按需请求对应站点权限 | 服务器须允许 CORS |

本地 HTML 的存储还受浏览器文件策略影响。安装、升级与跨端使用详见[使用指南](docs/GUIDE.md)。

## 数据与隐私

桌面内容默认保存在本机。WebDAV 凭据仅保存在当前浏览器，不进入桌面 JSON 备份；同步需要你自行配置服务。网站图标、天气、在线壁纸和社区网页会连接相应的第三方来源，具体触发方式与权限见[隐私说明](docs/PRIVACY.md)。

组件只在启用来源后于隔离 iframe 中运行，停用来源会停止运行并保留数据。组件联网遵循网页 CORS；浏览器书签需要单独授权。公开排布分享会清空组件个人内容，详见[社区与分享](docs/COMMUNITY.md)。

## 文档导航

| 我想了解 | 文档 |
| --- | --- |
| 使用、设置、快捷键与 WebDAV | [使用指南](docs/GUIDE.md) |
| 小组件架构、原生 API、社区 SDK | [中文 Wiki](docs/wiki/Home.md) · [English Wiki](docs/wiki/Home-en.md) |
| 功能边界与隐私 | [功能范围](docs/FEATURES.md) · [隐私说明](docs/PRIVACY.md) |
| 开发、测试与贡献 | [开发指南](docs/DEVELOPMENT.md) · [贡献指南](CONTRIBUTING.md) |
| 图标、壁纸与翻译 | [网站图标](docs/FAVICONS.md) · [壁纸](docs/WALLPAPERS.md) · [国际化](docs/I18N.md) |
| 版本变化、发布与验收 | [更新日志](CHANGELOG.md) · [发布指南](docs/RELEASES.md) · [验证记录](docs/QA.md) |

全部文档及语言入口见[文档索引](docs/README.md)。

## 本地开发

项目使用 HTML、CSS 与 JavaScript ES Modules。扩展可直接加载仓库根目录；CI 使用 Node.js 22、Python 3.13。

本仓库维护桌面系统、窗口管理、主题、宿主 API 和基础设置。组件实现在 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 中独立开发、测试和发布，详见[仓库边界与宿主协议](docs/PLUGIN-API.md)。

```sh
git clone https://github.com/Ktclat/qiye.git
cd qiye
npm test
python scripts/build-preview.py
```

修改 `index.html`、样式和 `src/` 后再生成 `Qiye-preview.html`。详细测试和源码结构见[开发指南](docs/DEVELOPMENT.md)；网页部署见 [GitHub Pages 指南](docs/DEPLOYMENT.md)。

## 参与贡献

欢迎提交 [Issue](https://github.com/Ktclat/qiye/issues) 或 Pull Request。报告问题时注明浏览器、使用扩展还是网页、复现步骤与实际结果。组件作者可从[原生组件开发](docs/wiki/Native-Widgets.md)或[社区组件开发](docs/wiki/Community-Widgets.md)开始。提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

Copyright © 2026 Ktclat and Qiye contributors. 项目采用 [GPL-3.0-only](LICENSE) 许可证。字体、历法引擎与外部素材适用各自的许可条款，相关来源、授权与致谢见[第三方声明](docs/THIRD_PARTY.md)。
