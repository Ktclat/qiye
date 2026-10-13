# 栖页 Qiye · GitHub Pages

栖页 v0.7.0 的公开网页演示。无需注册或登录，个人桌面保存在各自浏览器中，可通过自己的 WebDAV 服务同步。

**[打开栖页](https://ktclat.github.io/qiye/)** · **[完整源码与扩展安装](https://github.com/Ktclat/qiye/tree/main)**

本分支 `gh-pages` 专门保存由生产模块生成的静态网页文件。完整源码、功能说明、图标智能提取实现、隐私说明和测试位于同一仓库的 [main 分支](https://github.com/Ktclat/qiye/tree/main)。

## 许可

程序采用 GPL-3.0-only，完整许可见 [LICENSE](LICENSE)，对应源码和构建脚本在 main。字体和图片保留各自许可。

## 首次启用 Pages

打开 [仓库 Settings → Pages](https://github.com/Ktclat/qiye/settings/pages)，选择 **Deploy from a branch → gh-pages → /(root)**，然后点击 **Save**。首次部署完成后，上方演示地址才会显示栖页。可以在 [Actions](https://github.com/Ktclat/qiye/actions) 查看部署结果。

## 更新网站

在 `main` 分支的源码目录运行：

```sh
python3 scripts/build-pages.py /path/to/qiye-demo
```

输出目录应为 `gh-pages` 分支的独立 checkout 或 worktree。脚本生成 `index.html`、`icons/icon32.png`、`.nojekyll`、`LICENSE` 和本文档，保留目录中的 Git 历史与其他文件。请修改 `main` 中的源码后重新生成，不直接编辑生成的 HTML。

Pages 启用后，将生成文件提交并推送到本仓库的 **`gh-pages` 分支**，GitHub Pages 会自动部署。仅推送 `main` 不会更新演示页面；请先构建，再将生成文件推送到 `gh-pages`。

网页使用相对图标路径，其余样式和生产模块均已内联，无需 Node.js 或服务器构建。网站图标、壁纸与 WebDAV 等联网功能仍受相应服务和浏览器网络策略影响。

部署与数据迁移说明见 [源码仓库的部署指南](https://github.com/Ktclat/qiye/blob/main/docs/DEPLOYMENT.md)。
