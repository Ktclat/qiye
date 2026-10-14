# Wiki 与双语文档维护

[文档索引](README.md) · [中文 Wiki 源文件](wiki/Home.md) · [English wiki sources](wiki/Home-en.md)

`docs/wiki/` 是小组件技术文档的维护来源。中文为默认语言，英文页与中文页逐篇配对。GitHub Wiki 使用独立 Git 仓库，提交主仓库不会自动更新 Wiki。

## 文件与链接约定

| 文件 | 用途 |
| --- | --- |
| `Home.md` / `Home-en.md` | 默认中文首页与英文入口 |
| `Widgets-Overview.md` / `Widgets-Overview-en.md` | 架构、内置目录和数据模型 |
| `Native-Widgets.md` / `Native-Widgets-en.md` | 原生 API v3 |
| `Community-Widgets.md` / `Community-Widgets-en.md` | 社区协议 v1 与 SDK |
| `Widget-Testing.md` / `Widget-Testing-en.md` | 验收、排错与贡献 |
| `_Sidebar.md` / `_Footer.md` | GitHub Wiki 双语侧栏与页脚 |

源文件采用普通 Markdown 相对链接，例如 `Native-Widgets.md`、`../../src/widget-runtime.js`，因此在主仓库中即可浏览。生成脚本会将它们转换为 GitHub Wiki 页面地址或主仓库文件地址，并保留锚点。不要直接把源文件复制到 Wiki 根目录，否则跨仓库源码链接会失效。

代码块中的示例不会被转换。当前生成器支持本文档采用的行内 Markdown 链接；新增 HTML 链接或引用式链接时需同时扩展生成器。生成内容写入主仓库忽略的 `output/` 子目录，脚本不提交、不推送、不删除任何现有页面。

## 修改和验证

1. 依据当前源码修改中英文对应页面。接口字段、默认值、限额、示例与错误行为同时更新。
2. 更新两份首页、两份文档索引及 `_Sidebar.md` 中受影响的入口。
3. 新版本的变化写入 [CHANGELOG.md](../CHANGELOG.md)，不重新累积到 README；发布操作维护在 [RELEASES.md](RELEASES.md)。
4. 在仓库根目录执行：

```sh
python scripts/check-docs.py
python scripts/build-wiki.py --output output/wiki
```

链接检查覆盖主仓库 Markdown 的相对目标、标题锚点、README 版本标题、更新日志版本唯一性与倒序，以及 Wiki 语言配对，不联网验证外部 URL。发布前还需确认生成页面在 GitHub 的导航、表格和代码块显示正常。

## 首次启用与发布

仓库管理员在 **Settings → General → Features → Wikis** 启用 Wiki，保留协作者编辑限制。若 Wiki 尚未初始化，在 Wiki 页面创建首页后再克隆。操作依据见 [GitHub：添加与编辑 Wiki](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages) 和[编辑权限](https://docs.github.com/en/communities/documenting-your-project-with-wikis/changing-access-permissions-for-wikis)。

先将经过审阅的文档变更合入主仓库，再从最新主仓库生成 Wiki。以下命令从主仓库根目录执行，需要已登录并具备 Wiki 写权限的 Git 凭据：

```sh
# 首次执行；后续使用已有检出目录
git clone https://github.com/Ktclat/qiye.wiki.git output/qiye-wiki

# 已有目录先检查是否干净，再拉取最新内容
git -C output/qiye-wiki status --short
git -C output/qiye-wiki pull --ff-only

python scripts/check-docs.py
python scripts/build-wiki.py --output output/qiye-wiki
git -C output/qiye-wiki diff --check
git -C output/qiye-wiki diff
git -C output/qiye-wiki status --short
```

确认差异后，仅添加本套文档文件（不包括其他维护者的页面），提交并推送 Wiki 当前分支：

```sh
git -C output/qiye-wiki add Home.md Home-en.md Widgets-Overview.md Widgets-Overview-en.md Native-Widgets.md Native-Widgets-en.md Community-Widgets.md Community-Widgets-en.md Widget-Testing.md Widget-Testing-en.md _Sidebar.md _Footer.md
git -C output/qiye-wiki commit -m "docs: publish bilingual widget guides"
git -C output/qiye-wiki push
```

如果目录有未提交修改，先核对并保留他人变更；若有推送冲突，先拉取并合并，不强推。生成脚本只覆盖同名文档，不删除已下线页面；重命名或移除页面时，核实所有入口后在 Wiki 单独处理。

## 发布核对

- 打开 [Wiki 首页](https://github.com/Ktclat/qiye/wiki)，检查中文默认入口、英文切换、侧栏及页脚。
- 检查每篇页面的配对语言链接、源码链接与页内锚点。
- 主仓库与 Wiki 的正文应只差生成器转换的链接。网页按钮指向 `docs/COMMUNITY.md` 等原有入口时仍可到达新指南。
- CLI 未登录、浏览器未登录或无写权限时，保留仓库文档与 `output/wiki/` 产物，明确报告“尚未发布”；不能把 `has_wiki: true` 当作页面已经发布。
