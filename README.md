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

> 项目处于开发阶段，数据格式可能发生破坏性调整，目前不提供旧格式迁移。安装和升级前请阅读[使用指南](docs/GUIDE.md#安装与更新)。

## 功能亮点

| 能力 | 说明 |
| --- | --- |
| 自由编排桌面 | 网站、文件夹与多尺寸组件；拖动排序、跨组移动、键盘操作与撤销 |
| 14 类日常组件 | 天气、日历、备忘录、便签、待办、专注、倒数日、下班倒计时、习惯、时钟、摘录、换算器、壁纸与可订阅的热搜榜；已有热搜入口自动升级 |
| 搜索与浏览器集成 | 内置及自定义搜索引擎、本地查找、按需授权书签与历史、工具栏和右键收藏 |
| 外观定制 | 深浅主题、主题色、轻量材质、本地图片 / 视频壁纸、在线图库与独立布局设置 |
| 数据自主保存 | 本地存储、JSON 导入导出、带版本与冲突检查的 WebDAV 同步 |
| 社区与分享 | 订阅组件目录、运行隔离网页组件、预览并导入公开桌面排布 |
| 中英文界面 | 默认跟随浏览器语言，可手动切换；保留用户自己的名称和笔记 |

内置组件支持 `1×1`、`1×2`、`2×1`、`2×2`、`4×2`。天气需主动启用；热搜组件提供平台入口；中国法定节假日与调休数据目前覆盖 2026 年。完整能力与边界见[功能范围](docs/FEATURES.md)和[组件概览](docs/wiki/Widgets-Overview.md)。

## 快速开始

### 安装 Chrome / Edge 扩展

1. 从 [Releases](https://github.com/Ktclat/qiye/releases) 下载 `qiye-X.Y.Z-chrome-edge.zip` 并解压。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择直接包含 `manifest.json` 的目录。
4. 新建标签页，点击导航中的栖页图标打开设置；通过右上角 **＋** 添加网站与组件。

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

社区组件在详情窗口点击“运行”后加载，只能通过宿主接口读写自身数据。公开排布分享会清空组件个人内容，但保留主动分享的网站名称与网址；使用方法见[社区与分享](docs/COMMUNITY.md)。

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
