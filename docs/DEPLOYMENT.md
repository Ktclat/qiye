# 使用 GitHub Pages 发布栖页

网页地址：[栖页](https://ktclat.github.io/qiye/)。每次功能交付都同步更新网页端。

主程序 `qiye` 和组件库 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 各自使用短期 `codex/*` 分支开发，合入各自 `main`。主程序默认不附带组件，在「设置 → 组件源」启用官方源后添加组件。组件协议见 [宿主 API](PLUGIN-API.md)，扩展下载包发布见 [RELEASES.md](RELEASES.md)。

## 当前发布配置

| 项目 | 配置 |
| --- | --- |
| 仓库 | [Ktclat/qiye](https://github.com/Ktclat/qiye) |
| 源码分支 | `main` |
| Pages 发布来源 | **GitHub Actions** |
| 工作流 | `.github/workflows/ci.yml`，名称 **Verify and publish host** |
| 发布作业 | `publish_web`，依赖 `verify` 成功 |
| 自动更新 | 推送 `main` |
| 手动更新 | 在 `main` 上运行 **Run workflow** |
| 网页入口 | 从生产源码生成的 `index.html` |

历史 `gh-pages` 分支保留，不再用于主程序网页更新。组件库使用自己的标签发布流程，保留固定版本资源；更新主程序网页不替换已添加组件的清单。

## 首次配置与日常更新

1. 在 [Settings → Pages](https://github.com/Ktclat/qiye/settings/pages) 中将 **Build and deployment → Source** 设为 **GitHub Actions**。
2. 将完成验证的源码合入 `main`。
3. 在 [Actions](https://github.com/Ktclat/qiye/actions) 等待对应提交的 `verify` 和 `publish_web` 成功。
4. 检查公开网页的文件和实际行为后，再确认同步完成。

如果只需要重新发布网页，在 **Actions → Verify and publish host → Run workflow** 中选择 **main**。手动运行仍会先验证源码，且只允许主分支部署，不触发扩展 Release。也可以重跑最新主分支提交的 `publish_web` 作业；重新发布旧提交前应核对是否会覆盖较新的网页。

网页构建包使用 `github-pages-${{ github.run_id }}-${{ github.run_attempt }}` 名称，上传和部署引用同一名称。这样重跑作业时不会把上一次尝试留下的同名包混在一起。实现依据：[upload-pages-artifact 的 name 参数](https://github.com/actions/upload-pages-artifact#inputs-)、[deploy-pages 的 artifact_name 参数](https://github.com/actions/deploy-pages#inputs-)。

## 本地构建与线上核对

在源码目录运行，输出位置必须在仓库之外：

```sh
python scripts/build-pages.py /path/to/qiye-public
```

该命令先重建 `Qiye-preview.html`，再生成网页文件：

| 文件 | 用途 |
| --- | --- |
| `index.html` | 内联样式、生产脚本、字体与品牌图标 |
| `icons/` | 品牌 SVG 及各尺寸 PNG |
| `.nojekyll` | 静态文件标记 |
| `LICENSE` | 主程序许可证 |
| `README.md` | 当前网页版本及发布说明 |

扩展仍从源码目录加载；网页和独立预览使用同一份生产模块。新增资源使用适用于 `/qiye/` 项目路径的相对地址。不要手改生成的 HTML，也不需要为网页更新另行提交 `gh-pages`。

部署成功后，使用已安装 Playwright 的 Python 环境验证公开文件和真实组件：

```sh
python scripts/verify-live.py --expected /path/to/qiye-public
```

该脚本比对入口、说明、许可与图标的构建结果，实际启用官方源、添加便签、保存并刷新恢复，不拦截组件网络响应。发布成功不能代替壁纸服务或个人 WebDAV 的联调。

## 浏览器仍显示旧页面

已打开的页面需要刷新才能运行新版本。先用 `Ctrl+F5` 强制刷新，或从带版本参数的同源地址进入，例如 `https://ktclat.github.io/qiye/?v=0.10.2`。更换查询参数不更换网页来源，本机桌面数据仍可读取。不要通过清除站点数据来刷新代码。

先核对最新提交对应的 `publish_web` 是否成功；GitHub Pages 的静态缓存也可能延迟显示。部署成功后仍应检查公开字节和界面，不能仅凭推送完成就声称网页已同步。

## 从其他域名迁移桌面

网页桌面和 WebDAV 连接保存在当前网页来源的浏览器存储中。更换域名后，新站点不能直接读取旧站点的记录：

1. 在原页面打开「设置 → 备份与恢复」，导出 JSON 备份。
2. 在新页面导入备份，核对网址、布局和组件内容。
3. 按需重新配置 WebDAV。凭据不在备份中；已有远端文件应先比较，再选择使用哪个版本。

同一来源内仅修改项目路径或查询参数无需按域名迁移。GitHub Pages 的网页来源为 `https://ktclat.github.io`，不包含 `/qiye/`。扩展使用独立存储。

WebDAV 服务需允许该来源、`GET` / `PUT` / `OPTIONS` 方法，以及 `Authorization`、`Content-Type`、`If-Match`、`If-None-Match` 请求头，并暴露 `ETag`。HTTPS 和强 ETag 条件写入要求仍适用，见 [使用指南](GUIDE.md#webdav-同步)。

## 官方资料

- [GitHub Pages：使用自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages：配置发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
