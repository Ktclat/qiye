<p align="center">
  <img src="icons/qiye-icon.svg" alt="栖页 Qiye" width="88" height="88">
</p>

<h1 align="center">栖页 Qiye</h1>

<p align="center"><strong>让每一次打开，都有一处喜欢的风景。</strong></p>
<p align="center">可自由编排的浏览器新标签页 · 本地保存 · 自有 WebDAV 同步</p>

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

栖页将常用网站、搜索、日常小组件与壁纸放在同一张桌面上。你可以调整分组、卡片尺寸、主题与布局，在 Chrome / Edge 中打开自己喜欢的新标签页。无需栖页账号；数据保存在当前浏览器，也可备份为 JSON 或同步到自己的 WebDAV 服务。

> 主程序默认不带小组件。请在**设置 → 组件源**启用预置的官方源，再从**添加 → 小组件**选择尺寸并预览。旧桌面组件数据保留，源需主动启用。

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 自由编排桌面 | 网站、文件夹与多尺寸组件；拖动排序、跨组移动、键盘操作与撤销 |
| 独立小组件库 | [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 单独维护组件源码、清单、资源、测试和发布；官方源默认关闭 |
| 搜索与浏览器集成 | 内置及自定义搜索引擎、本地查找、按需授权书签与历史、工具栏和右键收藏 |
| 外观定制 | 深浅主题、主题色、轻量材质、本机上传壁纸库（图片 / 视频）、在线图库与独立布局设置 |
| 图片处理 | 壁纸上传压缩由主程序提供；完整图片压缩工具由独立组件源提供 |
| 数据自主保存 | 本地存储、JSON 导入导出、带版本与冲突检查的 WebDAV 同步 |
| 社区与分享 | 订阅组件目录、运行隔离网页组件、预览并导入公开桌面排布 |
| 中英文界面 | 默认跟随浏览器语言，可手动切换；保留用户自己的名称和笔记 |

本仓库只维护桌面系统、窗口管理、主题、插件 API 和基础设置。组件业务实现在 [qiye-widgets](https://github.com/Ktclat/qiye-widgets)，两边独立开发、测试和发布，详见[仓库边界与宿主协议](docs/PLUGIN-API.md)。

## 快速开始

### 安装 Chrome / Edge 扩展

1. 从 [Releases](https://github.com/Ktclat/qiye/releases) 下载 `qiye-X.Y.Z-chrome-edge.zip` 并解压。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择直接包含 `manifest.json` 的目录。
4. 新建标签页，点击导航中的栖页图标打开设置；通过右上角 **＋** 添加网站；添加组件前先在设置中启用来源。

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

Copyright © 2026 Ktclat and Qiye contributors. 项目采用 [GPL-3.0-only](LICENSE)。字体、历法引擎与外部素材保留各自许可，详见[第三方声明](docs/THIRD_PARTY.md)。交互参考 iTab，栖页品牌、界面图标和代码独立实现。
