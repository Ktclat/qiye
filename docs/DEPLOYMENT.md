# 使用 GitHub Pages 发布栖页

扩展下载包的自动发布见 [RELEASES.md](RELEASES.md)。本页只描述演示网站部署。

栖页在同一个 **[Ktclat/qiye](https://github.com/Ktclat/qiye)** 仓库中维护两个分支：**`main` 保存完整源码、扩展文件和测试；`gh-pages` 仅保存生成后的演示网页。** 两者使用同一份生产模块，网页更新通过重新生成和提交 `gh-pages` 完成。

网页地址：**<https://ktclat.github.io/qiye/>**。

**发布约定：每次功能交付都同步更新网页端。** 当前沿用 `gh-pages` 分支原生部署；最新部署状态以本仓库 [Actions](https://github.com/Ktclat/qiye/actions) 的对应提交为准。

## 当前发布配置

| 项目 | 配置 |
| --- | --- |
| 仓库 | [Ktclat/qiye](https://github.com/Ktclat/qiye) |
| 源码分支 | **main** |
| 发布方式 | **Deploy from a branch** |
| 发布分支 | **gh-pages** |
| 文件夹 | **/(root)** |
| 入口文件 | `gh-pages` 分支根目录的 `index.html` |
| 访问地址 | <https://ktclat.github.io/qiye/> |
| 当前部署状态 | Pages 已启用，`gh-pages` 原生部署成功 |

## Pages 设置检查与首次配置

本仓库已完成以下配置。需要核对设置，或在其他仓库首次采用相同方案时，可按以下步骤操作：

1. 打开本仓库的 [Settings → Pages](https://github.com/Ktclat/qiye/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。如果已经是该值，保持不变。
3. 在 **Branch** 选择 **gh-pages**，右侧文件夹选择 **/(root)**；尚未配置时，将 **None** 改为 **gh-pages**。
4. 点击 **Save**。如果分支列表尚未出现 `gh-pages`，刷新设置页后重新选择。
5. 打开本仓库 [Actions](https://github.com/Ktclat/qiye/actions)，等待原生 **pages build and deployment** 运行成功，再访问 Pages 设置页提供的站点地址。

需要保存的组合是 **Deploy from a branch → gh-pages → /(root) → Save**。`main` 中的根目录保留扩展源码，网页发布来源应选择已生成演示文件的 `gh-pages`。

### 仓库名与访问地址

普通项目仓库不需要以 `.github.io` 结尾。当前仓库名 `qiye` 决定了项目站点的路径；发布分支叫 `gh-pages` 不会改变地址：

```text
https://ktclat.github.io/qiye/
```

只有名为 `Ktclat.github.io` 的仓库才对应该账户的根站点 `https://ktclat.github.io/`。无需为当前方案另建仓库或修改 `qiye` 的名称；如需其他域名，须另行配置自定义域名。

## 准备演示分支工作目录

在源码仓库的 `main` 分支中，为 `gh-pages` 创建独立工作目录。首次使用、且本地尚无 `gh-pages` 分支时：

```bash
git switch main
git fetch origin gh-pages
git worktree add -b gh-pages ../qiye-demo origin/gh-pages
```

此时当前目录仍是 `main` 的源码，`../qiye-demo` 是同一仓库 `gh-pages` 分支的工作目录。如果本地已存在 `gh-pages` 且未在其他工作目录检出，可改用 `git worktree add ../qiye-demo gh-pages`。

也可以从源码仓库根目录另行克隆演示分支；与上述 worktree 方式二选一：

```bash
git clone --single-branch --branch gh-pages https://github.com/Ktclat/qiye.git ../qiye-demo
```

## 构建网页发布文件

在 `main` 的源码根目录运行：

```bash
python3 scripts/build-pages.py /path/to/qiye-demo
```

将 `/path/to/qiye-demo` 替换为 `gh-pages` 的独立工作目录；沿用上述示例时填 `../qiye-demo`。生成位置应使用演示分支目录，避免覆盖 `main` 的扩展入口。脚本从生产源码输出以下文件：

| 生成文件 | 用途 |
| --- | --- |
| `index.html` | 内联样式、生产 JavaScript、本地 Inter 字体、完整字体许可和栖页品牌图标的网页入口 |
| `icons/` | 品牌 SVG 源图及各尺寸 PNG，网页入口同时内嵌所需图标 |
| `.nojekyll` | 直接发布静态文件 |
| `README.md` | 演示分支说明及 `main` 源码入口 |

扩展继续从 `main` 的源码目录加载，无需为安装扩展运行此脚本。独立下载预览 `Qiye-preview.html` 仍由 `python3 scripts/build-preview.py` 生成；它与 Pages 文件都以生产源码为依据，修改界面时应编辑源码，再重新生成对应交付。

## 后续更新

1. 在 `main` 修改页面或模块，完成相应验证后提交源码。
2. 更新 `gh-pages` 的工作目录，运行 `scripts/build-pages.py` 将网页生成到该目录。
3. 检查生成文件的差异，将这些文件提交并推送到 **`gh-pages` 分支**。
4. 在本仓库 [Actions](https://github.com/Ktclat/qiye/actions) 等待此次推送对应的部署运行成功，再访问网页核对结果。

沿用上面的目录示例，在 `main` 的源码根目录执行：

```bash
git -C ../qiye-demo pull --ff-only origin gh-pages
python3 scripts/build-pages.py ../qiye-demo
git -C ../qiye-demo status --short
git -C ../qiye-demo add index.html icons/ .nojekyll README.md
git -C ../qiye-demo commit -m "Update Qiye web preview"
git -C ../qiye-demo push origin gh-pages
```

**只推送 `main` 不会更新演示页面。** 当前流程需要重新生成网页并提交到 `gh-pages`；首次保存 Pages 配置后，该分支的后续更新由 GitHub 原生 Pages 流程发布，无需添加自定义 Actions 工作流。

保留 `.nojekyll` 以及相对资源路径。项目站点部署在 `/qiye/` 下，新增资源应随构建复制到演示目录，并使用 `./icons/example.png` 这类相对引用，避免写成 `/icons/example.png`。

## 从其他域名迁移桌面

网页桌面和 WebDAV 连接信息保存在当前网页来源的浏览器存储中。切换域名后，新站点不能直接读取旧站点的本机记录。

1. 在原页面打开“设置 → 备份与恢复”，导出 JSON 备份。
2. 在 GitHub Pages 页面导入该备份，核对网址、布局和组件内容。
3. 如需同步，在新页面重新填写 WebDAV 连接。凭据不包含在 JSON 备份中；已有远端文件应先比较并确认，再选择使用哪个版本。

也可以在两端分别配置同一 WebDAV 文件后进行同步。安装版扩展使用自己的存储，网页域名切换不会搬动扩展内的数据。

### WebDAV 的 CORS 来源

GitHub Pages 的网页来源仍为 **`https://ktclat.github.io`**，来源中不包含 `/qiye/` 路径。调整同一域名下的项目路径不会产生新的 CORS 来源；同一来源下的网页也会共享该来源的浏览器存储，因此仅迁移同一来源内的路径时，不必把它当作域名迁移。

服务端需允许此来源、`GET` / `PUT` / `OPTIONS` 方法和 `Authorization`、`Content-Type`、`If-Match`、`If-None-Match` 请求头，并通过 `Access-Control-Expose-Headers: ETag` 暴露版本信息。HTTPS 与强 ETag 条件写入要求继续适用，详见 [使用指南的同步说明](GUIDE.md#webdav-同步)。

## 上线验收

当前验证记录见 [QA.md](QA.md)；旧版结果保留在历史 QA 文档，不代替新版验收。每次更新后，应针对当前地址 `https://ktclat.github.io/qiye/` 核对以下项目：

- 访问 Pages 设置中提供的地址，确认显示栖页而非 404 页面。
- 检查时钟、分组、卡片、设置弹层及图标，确认脚本和样式正常加载。
- 刷新页面后核对本机修改能否保留。
- 按需测试壁纸 API 与自己的 WebDAV 服务；公开网页部署成功不能替代这些服务的联调。

发布失败时先查看本仓库的 [Actions 运行记录](https://github.com/Ktclat/qiye/actions)，并确认 Source、Branch 和文件夹与上表一致。如果 Branch 显示 **None**，按“Pages 设置检查与首次配置”完成选择与保存。如果站点仍显示旧内容，检查生成文件是否已经推送到 `gh-pages`，以及最新部署是否对应这次提交。

## 官方文档

- [GitHub Pages：配置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages：站点介绍](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
