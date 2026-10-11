# 使用 GitHub Pages 发布栖页

栖页的网页入口是仓库根目录的 `index.html`。页面使用相对路径加载 `styles.css`、`src/` 和 `icons/`，可直接部署到 GitHub Pages 的 `/qiye/` 项目路径，无需构建或配置服务器。

## 本仓库的发布配置

| 项目 | 配置 |
| --- | --- |
| 仓库 | [Ktclat/qiye](https://github.com/Ktclat/qiye) |
| 发布方式 | **Deploy from a branch** |
| 分支 | **main** |
| 文件夹 | **/(root)** |
| 入口文件 | `index.html` |
| 预期访问地址 | <https://ktclat.github.io/qiye/> |

仓库包含 `.nojekyll`，用于直接发布静态文件。该文件只控制发布处理方式，不能代替仓库中首次启用 Pages 的设置。

### 仓库名与访问地址

普通项目仓库不需要以 `.github.io` 结尾。`Ktclat/qiye` 对应项目地址 `https://ktclat.github.io/qiye/`；只有名为 `Ktclat.github.io` 的仓库才对应该账户的根站点 `https://ktclat.github.io/`。给其他仓库名加上 `.github.io` 不会自动创建新的子域名，也不能代替启用 Pages。

## 首次启用

1. 以仓库拥有者或具有 Pages 管理权限的身份，打开 [Settings → Pages](https://github.com/Ktclat/qiye/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. 在 **Branch** 选择 **main**，文件夹选择 **/(root)**，点击 **Save**。
4. 在仓库 [Actions](https://github.com/Ktclat/qiye/actions) 查看 GitHub 自动生成的 Pages 构建与部署运行。运行成功后，使用设置页显示的站点地址访问。

这套配置直接发布已有的 HTML、CSS 和 JavaScript，不需要创建自定义 Actions 工作流。首次启用成功后，后续推送到 `main` 会触发站点更新。

仓库中有发布文件并不代表 Pages 已经启用；请以 Pages 设置、部署运行结果和实际网页响应为准。

## 后续更新

修改 `index.html`、样式或 `src/` 后，将修改提交并推送到 `main`。独立下载预览仍由 `python3 scripts/build-preview.py` 生成；运行该脚本并提交更新后的 `Qiye-preview.html`，可让离线预览与源码保持一致。GitHub Pages 首页直接使用 `index.html`，无需在两份 HTML 之间手动复制内容。

保留 `.nojekyll` 以及现有相对资源路径。项目站点部署在 `/qiye/` 下，新增资源引用应使用 `src/example.js`、`./icons/example.png` 这类相对路径，避免把站点根路径写成 `/src/example.js`。

## 从其他域名迁移桌面

网页桌面和 WebDAV 连接信息保存在当前网页来源的浏览器存储中。切换域名后，新站点不能直接读取旧站点的本机记录。

1. 在原页面打开“设置 → 数据”，导出 JSON 备份。
2. 在 GitHub Pages 页面导入该备份，核对网址、布局和组件内容。
3. 如需同步，在新页面重新填写 WebDAV 连接。凭据不包含在 JSON 备份中；已有远端文件应先比较并确认，再选择使用哪个版本。

也可以在两端分别配置同一 WebDAV 文件后进行同步。安装版扩展使用自己的存储，网页域名切换不会搬动扩展内的数据。

### WebDAV 的新 CORS 来源

GitHub Pages 的网页来源为 **`https://ktclat.github.io`**，来源中不包含 `/qiye/` 路径。

服务端需允许此来源、`GET` / `PUT` / `OPTIONS` 方法和 `Authorization`、`Content-Type`、`If-Match`、`If-None-Match` 请求头，并通过 `Access-Control-Expose-Headers: ETag` 暴露版本信息。HTTPS 与强 ETag 条件写入要求继续适用，详见 [README 的同步说明](../README.md#webdav-同步)。

## 上线验收

- 访问 Pages 设置中提供的地址，确认显示栖页而非 404 页面。
- 检查时钟、分组、卡片、设置弹层及图标，确认脚本和样式正常加载。
- 刷新页面后核对本机修改能否保留。
- 按需测试壁纸 API 与自己的 WebDAV 服务；公开网页部署成功不能替代这些服务的联调。

发布失败时先查看 [Actions 运行记录](https://github.com/Ktclat/qiye/actions)，并确认 Source、Branch 和文件夹与上表一致。

## 官方文档

- [GitHub Pages：配置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages：站点介绍](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
