# 使用 GitHub Pages 发布栖页

栖页使用两个仓库：**[Ktclat/qiye](https://github.com/Ktclat/qiye)** 保存完整源码、扩展文件和测试，**[Ktclat/qiye.ktclat.github.io](https://github.com/Ktclat/qiye.ktclat.github.io)** 保存生成后的网页文件，并通过 GitHub Pages 发布。

网页地址：**<https://ktclat.github.io/qiye.ktclat.github.io/>**。

## 当前发布配置

| 项目 | 配置 |
| --- | --- |
| 源码仓库 | [Ktclat/qiye](https://github.com/Ktclat/qiye) |
| 发布仓库 | [Ktclat/qiye.ktclat.github.io](https://github.com/Ktclat/qiye.ktclat.github.io) |
| 发布方式 | **Deploy from a branch** |
| 分支 | **main** |
| 文件夹 | **/(root)** |
| 入口文件 | 发布仓库根目录的 `index.html` |
| 访问地址 | <https://ktclat.github.io/qiye.ktclat.github.io/> |

发布仓库已启用 Pages，并已完成原生 **pages build and deployment** 运行。配置可在发布仓库的 [Settings → Pages](https://github.com/Ktclat/qiye.ktclat.github.io/settings/pages) 查看；每次更新生成文件后，在该仓库的 [Actions](https://github.com/Ktclat/qiye.ktclat.github.io/actions) 检查部署结果。

### 仓库名与访问地址

普通项目仓库不需要以 `.github.io` 结尾。当前发布仓库名是 `qiye.ktclat.github.io`，因此它仍是一个项目站点，完整仓库名成为 URL 路径：

```text
https://ktclat.github.io/qiye.ktclat.github.io/
```

只有名为 `Ktclat.github.io` 的仓库才对应该账户的根站点 `https://ktclat.github.io/`。当前仓库名不会自动获得 `https://qiye.ktclat.github.io/` 子域名；如需其他域名，须另行配置自定义域名。

## 构建网页发布文件

在源码仓库根目录运行：

```bash
python3 scripts/build-pages.py /path/to/qiye-pages
```

将 `/path/to/qiye-pages` 替换为发布仓库的本地检出目录。脚本从生产源码生成网页，并输出以下文件：

| 生成文件 | 用途 |
| --- | --- |
| `index.html` | 内联页面样式和生产 JavaScript 模块的网页入口 |
| `icons/icon32.png` | 网页标签图标，使用相对路径引用 |
| `.nojekyll` | 直接发布静态文件 |
| `README.md` | 发布仓库说明及源码入口 |

例如，将两个仓库检出到相邻目录：

```bash
git clone https://github.com/Ktclat/qiye.git
git clone https://github.com/Ktclat/qiye.ktclat.github.io.git qiye-pages
cd qiye
python3 scripts/build-pages.py ../qiye-pages
```

扩展继续从源码仓库加载，无需为安装扩展运行此脚本。独立下载预览 `Qiye-preview.html` 仍由 `python3 scripts/build-preview.py` 生成；它与 Pages 文件都以生产源码为依据，修改界面时应编辑源码，再重新生成对应交付。

## 后续更新

1. 在 `Ktclat/qiye` 修改页面或模块，完成相应验证后提交源码。
2. 更新发布仓库的本地检出，运行 `scripts/build-pages.py` 将网页生成到该目录。
3. 检查生成文件的差异，将这些文件提交并推送到 **发布仓库的 `main` 分支**。
4. 在发布仓库 [Actions](https://github.com/Ktclat/qiye.ktclat.github.io/actions) 等待 Pages 运行成功，再访问网页核对结果。

沿用上面的相邻目录示例，可在源码仓库根目录执行：

```bash
git -C ../qiye-pages pull --ff-only origin main
python3 scripts/build-pages.py ../qiye-pages
git -C ../qiye-pages status --short
git -C ../qiye-pages add index.html icons/icon32.png .nojekyll README.md
git -C ../qiye-pages commit -m "Update Qiye web preview"
git -C ../qiye-pages push origin main
```

**只向源码仓库 `Ktclat/qiye` 推送代码，不会自动更新另一个仓库或触发其 Pages 部署。** 当前流程需要生成文件并提交到发布仓库；部署由发布仓库现有的原生 Pages 流程处理，无需添加自定义 Actions 工作流。

保留 `.nojekyll` 以及相对资源路径。项目站点部署在 `/qiye.ktclat.github.io/` 下，新增资源应随构建复制到发布目录，并使用 `./icons/example.png` 这类相对引用，避免写成 `/icons/example.png`。

## 从其他域名迁移桌面

网页桌面和 WebDAV 连接信息保存在当前网页来源的浏览器存储中。切换域名后，新站点不能直接读取旧站点的本机记录。

1. 在原页面打开“设置 → 数据”，导出 JSON 备份。
2. 在 GitHub Pages 页面导入该备份，核对网址、布局和组件内容。
3. 如需同步，在新页面重新填写 WebDAV 连接。凭据不包含在 JSON 备份中；已有远端文件应先比较并确认，再选择使用哪个版本。

也可以在两端分别配置同一 WebDAV 文件后进行同步。安装版扩展使用自己的存储，网页域名切换不会搬动扩展内的数据。

### WebDAV 的新 CORS 来源

GitHub Pages 的网页来源仍为 **`https://ktclat.github.io`**，来源中不包含 `/qiye.ktclat.github.io/` 路径。调整同一域名下的项目路径不会产生新的 CORS 来源；同一来源下的网页也会共享该来源的浏览器存储。

服务端需允许此来源、`GET` / `PUT` / `OPTIONS` 方法和 `Authorization`、`Content-Type`、`If-Match`、`If-None-Match` 请求头，并通过 `Access-Control-Expose-Headers: ETag` 暴露版本信息。HTTPS 与强 ETag 条件写入要求继续适用，详见 [README 的同步说明](../README.md#webdav-同步)。

## 上线验收

- 访问 Pages 设置中提供的地址，确认显示栖页而非 404 页面。
- 检查时钟、分组、卡片、设置弹层及图标，确认脚本和样式正常加载。
- 刷新页面后核对本机修改能否保留。
- 按需测试壁纸 API 与自己的 WebDAV 服务；公开网页部署成功不能替代这些服务的联调。

发布失败时先查看发布仓库的 [Actions 运行记录](https://github.com/Ktclat/qiye.ktclat.github.io/actions)，并确认 Source、Branch 和文件夹与上表一致。如果站点仍显示旧内容，检查生成文件是否已经提交到发布仓库，以及最新部署是否对应这次提交。

## 官方文档

- [GitHub Pages：配置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages：站点介绍](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
