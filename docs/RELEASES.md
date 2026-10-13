# 自动发布与下载包

工作流：`.github/workflows/ci.yml`。它先验证当前提交，再将同一次构建的产物发布到 GitHub Releases。

## 触发方式

| 操作 | 结果 |
| --- | --- |
| Push 到 `main`，版本号与 push 前不同 | 测试成功后创建 `vX.Y.Z` Release |
| Push `vX.Y.Z` 标签 | 要求标签与 manifest/package 的版本一致，测试成功后发布 |
| 普通 `main` 提交，版本号未变化且已有正式 Release | 仅验证和上传 Actions 构建产物 |
| 新版本验证失败后，修复代码并重推相同版本 | 当前版本尚无正式 Release 时，验证通过后继续发布 |
| Pull Request 或手动运行 Verify and package | 仅验证和打包，不发布 |

版本号采用 `X.Y.Z`，同步修改 `manifest.json` 和 `package.json`。每段最大 65535，不支持 `-rc` 后缀。页面显示版本由构建脚本生成到 `src/version.js`，无需在 UI 模板中重复修改。

推荐流程（以下版本号仅为示例，下次发布应递增）：

```sh
# 编辑 manifest.json 和 package.json，例如都设为 0.5.1
npm test
python scripts/build-preview.py
python scripts/package-release.py
git add manifest.json package.json src/version.js Qiye-preview.html
# 将本次其他源码、文档与测试改动一并提交
git commit -m "Release 0.5.1"
git push origin main
```

也可使用标签方式；先提交完整源码，再执行：

```sh
git tag v0.5.1
git push origin v0.5.1
```

不需要同时推送 main 和标签。两者重复触发时发布任务串行，已发布版本保持原附件。不要重复使用旧版本号；同名标签指向不同提交会失败。规则或组织策略限制自动创建标签/Release 时，需在仓库端调整相应策略；脚本不会绕过保护规则。

## 验证与发布顺序

1. 检查 package/manifest 版本、Node 逻辑测试、Python 发布规则测试。
2. 从相同生产模块构建预览和 Pages 产物。
3. 安装 Playwright 测试浏览器；运行桌面套件（包含编辑器套件）及组件/缩放套件，并分别测试生产模块和独立 HTML 的中英文日历、备忘录、天气与失败恢复。
4. 生成分发包，确认已提交的预览与版本模块没有过期。
5. 上传 `qiye-release` 构建产物；发布任务下载同一份产物。
6. 仅发布任务获取 `contents: write`，使用仓库 `GITHUB_TOKEN` 创建草稿、上传全部附件，再转为正式 Release。

源码检查和 PR 任务仅有 `contents: read`，不需要额外 PAT 或私钥。任何验证失败都不会进入发布任务。中途失败留下的草稿可通过重跑任务继续上传；正式 Release 不覆盖。验证阶段失败且尚未创建标签时，可直接修复源码、保留版本号重推 main；发布脚本检查版本是否已正式发布，缺失时继续创建。若标签已经指向另一提交，则应递增版本号，不能覆盖旧标签。`main` 自动发布的标签通过同一次任务创建，不依赖标签再次触发工作流。

## 产物

| 文件 | 用途 |
| --- | --- |
| `qiye-X.Y.Z-chrome-edge.zip` | 扩展运行文件，ZIP 根目录直接包含 manifest；不打包测试、开发工具和本机数据 |
| `qiye-X.Y.Z-source.zip` | 同版本源码、测试、构建脚本、文档及许可 |
| `qiye-X.Y.Z-preview.html` | 可直接打开的独立网页预览 |
| `qiye-X.Y.Z-SHA256SUMS.txt` | 上述三个文件的 SHA-256 校验值 |

扩展 ZIP 解压后，在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式，加载包含 manifest.json 的目录。浏览器不会因为下载 ZIP 自动安装；此流程不签发 CRX，不自动上传 Chrome/Edge 商店。保留安装路径并重新加载扩展。项目未正式推出，不保证旧数据或旧备份可用；当前仅使用 schema 4，开发阶段的数据结构变化不提供迁移。

本地打包无需第三方 Python 库：`python scripts/package-release.py --output dist`。文件采用明确的路径/后缀清单，并使用固定 ZIP 时间戳，排除 `.git`、测试工具、本机备份、密钥和日志。不要在 `src`、`docs` 等发布源码目录放私人文件。

GitHub Pages 部署仍遵循 [DEPLOYMENT.md](DEPLOYMENT.md)，Release 工作流不会改写 `gh-pages` 分支。

参考：[GitHub Actions 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[GitHub Releases API](https://docs.github.com/en/rest/releases/releases)。
