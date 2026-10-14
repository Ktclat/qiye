# 参与栖页 Qiye

欢迎通过本仓库的 Issues 反馈问题、讨论改进，通过 Pull Request 提交修改。提交前请先阅读 [README](README.md)、[功能范围](docs/FEATURES.md) 和 [验证记录](docs/QA.md)。

## 本地开始

1. 克隆或下载仓库。仓库根目录直接包含 `manifest.json`。
2. 在 Chrome 的 `chrome://extensions/` 或 Edge 的 `edge://extensions/` 中打开开发者模式，加载仓库根目录。
3. 新建标签页；修改源码后在扩展管理页点击“重新加载”，再重新打开栖页。

使用扩展不需要安装 npm 依赖或编译。开发测试使用 Node.js 和 npm，生成独立网页预览使用 Python 3。当前验证环境为 Node.js 22、Python 3.13。

```sh
npm test
python3 scripts/build-preview.py
python3 -m unittest discover -s tests -p release_test.py
```

Windows 如未提供 `python3` 命令，可使用 `py -3 scripts/build-preview.py`。`Qiye-preview.html` 是提交到仓库的生成文件；请修改 `index.html`、样式及 `src/` 模块，再运行生成脚本，不要只修改生成结果。

GitHub Pages 使用本仓库 `gh-pages` 分支的根目录，`main` 保存源码。运行 `python3 scripts/build-pages.py /path/to/qiye-demo`，将文件生成到 `gh-pages` 的独立 checkout 或 worktree，再提交并推送该分支。每次交付功能或修复时，必须同步更新并验证网页端，不能只更新本地扩展或下载包。仅推送 `main` 不会更新演示页面。保留相对资源路径和 `.nojekyll`，详见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 开发阶段约定

项目尚未正式推出，**不需要兼容旧版本**。允许直接调整数据结构、组件接口与功能，不保留旧字段、迁移器、兼容别名或按版本回退的分支。默认值仅用于创建新数据；导入与持久化必须验证完整的当前格式，不能通过自动补字段掩盖缺失数据。

当前桌面格式为 `schemaVersion: 5`，存储键为 `qiye.state.v5`。结构发生破坏性变化时同步更新版本标识、创建逻辑、校验、测试夹具和文档；不实现历史格式读取。多标签页修订冲突、存储失败保留和 WebDAV 条件写入仍是当前功能的正确性要求。

## 修改与验证

每个 Pull Request 围绕一个明确的问题，说明原因、修改后的行为以及实际做过的验证。涉及页面或组件时附上自己的浏览器截图，并注明浏览器版本和窗口尺寸。

- 逻辑、存储、导入和同步改动应运行 `npm test`，为新增的行为或具体回归风险补充必要用例。
- 修改前台模块或样式后重新生成 `Qiye-preview.html`，将源码和生成结果一同提交。
- 扩展权限、popup、右键菜单、快捷键和拖拽交互须在安装版验证；自动化逻辑测试不能替代浏览器验收。
- WebDAV 改动应核对首次创建、强 ETag 条件覆盖、冲突确认和失败保留行为。真实联调请使用自己的测试目录，并写明服务与结果；不要在仓库提交连接信息。
- 更新受影响的说明文档。仅执行过的验证可以标为通过，未执行的部分写清楚。

## 反馈问题

请提供版本、浏览器和操作系统、使用安装版还是网页预览、复现步骤、预期结果和实际结果。同步问题可补充服务类型、HTTP 状态码以及服务是否支持 ETag / CORS，无需提供账号或目录的私有地址。

公开 Issue 或附件中请去除用户名、密码、Authorization 头、私人网址、便签内容及完整桌面备份。不要公开提交仍可利用的安全问题细节或他人的数据；可先用不含敏感信息的 Issue 询问维护者的私下报告方式。

## 产品方向

当前版本坚持免栖页账号、本地保存、自有 WebDAV 同步和按需启用的公开壁纸 API。日历、备忘录和天气按最新需求完善；暂不增加高级工具或行情、赛事等数据组件。涉及产品范围、存储格式、权限或新增第三方服务的变化，建议先在 Issue 说明使用场景和结构设计。


## 组件与授权

界面文案、日期和数字格式遵循 [I18N.md](docs/I18N.md)，新增文案同时提供中英文，禁止翻译用户内容。新组件请先阅读 [WIDGETS.md](docs/WIDGETS.md)，新壁纸来源阅读 [WALLPAPERS.md](docs/WALLPAPERS.md)。宿主负责拖拽，不添加每卡拖动按钮；主题与网络请求必须遵守统一边界。浏览器验收命令见 [QA.md](docs/QA.md)。

项目代码以 GPL-3.0-only 分发，见 [LICENSE](LICENSE)。向本仓库提交用于合入发布的代码，即应提供项目可按 GPLv3 使用和发布的权利；请只提交自己有权授权的内容，并保留原作者/兼容许可证说明，不要求版权转让。不要把不兼容的代码或未许可的图标、壁纸提交进来。

对独立外部组件/网站/服务，不设置额外“全部开源”的平台要求。直接组合进本程序的模块仍受 GPLv3 的组合分发条件约束；具体界限见组件指南。不提交用户名、密码、完整私有桌面备份或服务密钥。

## 版本与发布

随包原生组件使用 [组件 API v3](docs/wiki/Native-Widgets.md)，自托管网页使用 [社区协议 v1](docs/wiki/Community-Widgets.md)。发布时同步修改 manifest.json 与 package.json，运行预览构建更新生成的版本模块和 HTML，再提交完整源码。推送新版本到 main 或匹配标签即可触发测试和 Release，详见 [RELEASES.md](docs/RELEASES.md)。

## 文档维护

README.md 默认中文，README.en.md 提供对应英文概览，首页保持项目介绍、安装和导航。版本变化统一写入 [CHANGELOG.md](CHANGELOG.md)，发布操作维护在 [RELEASES.md](docs/RELEASES.md)，避免在首页重复累积版本章节。

小组件技术文档以 `docs/wiki/` 为源，修改接口时同步中英文页面、示例与索引。运行 `python scripts/check-docs.py` 校验链接，运行 `python scripts/build-wiki.py` 生成 Wiki 内容；发布方式见 [WIKI.md](docs/WIKI.md)。纯文档调整无需重建未改变的应用预览。
