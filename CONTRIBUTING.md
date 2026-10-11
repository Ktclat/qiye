# 参与栖页 Qiye

欢迎通过本仓库的 Issues 反馈问题、讨论改进，通过 Pull Request 提交修改。提交前请先阅读 [README](README.md)、[功能范围](docs/FEATURES.md) 和 [验证记录](docs/QA.md)。

## 本地开始

1. 克隆或下载仓库。仓库根目录直接包含 `manifest.json`。
2. 在 Chrome 的 `chrome://extensions/` 或 Edge 的 `edge://extensions/` 中打开开发者模式，加载仓库根目录。
3. 新建标签页；修改源码后在扩展管理页点击“重新加载”，再重新打开栖页。

使用扩展不需要安装 npm 依赖或编译。开发测试使用 Node.js 和 npm，生成独立网页预览使用 Python 3。当前验证环境为 Node.js 24、Python 3.12。

```sh
npm test
python3 scripts/build-preview.py
```

Windows 如未提供 `python3` 命令，可使用 `py -3 scripts/build-preview.py`。`Qiye-preview.html` 是提交到仓库的生成文件；请修改 `index.html`、样式及 `src/` 模块，再运行生成脚本，不要只修改生成结果。

GitHub Pages 使用本仓库 `gh-pages` 分支的根目录，`main` 保存源码。运行 `python3 scripts/build-pages.py /path/to/qiye-demo`，将文件生成到 `gh-pages` 的独立 checkout 或 worktree，再提交并推送该分支。仅推送 `main` 不会更新演示页面。保留相对资源路径和 `.nojekyll`，详见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。

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

当前版本坚持免栖页账号、本地保存、自有 WebDAV 同步和按需启用的公开壁纸 API。暂不增加高级工具或新的实时数据组件。涉及产品范围、存储格式、权限或新增第三方服务的变化，建议先在 Issue 说明使用场景和兼容方式。
