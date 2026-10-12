# 壁纸中心与来源接入

适用版本：v0.3.1。点击“发现壁纸”组件或右上角壁纸按钮，打开同一个双栏窗口。左侧直接列来源，不显示“在线图库”“更多灵感”等组标题；参数按钮在左栏底部。右侧浏览和应用图片。

| 来源 | 当前实现与边界 |
| --- | --- |
| 自定义背景 | 本机图片/视频，最大 4 MiB；进入用户桌面备份及 WebDAV |
| 官方背景 | 6 款栖页原创 CSS 渐变，离线可用；不是 iTab 的私有资源 |
| deepin | 7 张官方开放目录背景，固定仓库提交，原图直连；4 张一页，保留 UnionTech 署名和 CC BY 4.0 |
| Wallhaven | 23 张 SFW general 精选，2026-10-12 官方 API 清单快照，12 张一页；缩略图和原图直连，**不是实时搜索或实时月榜** |
| Lorem Picsum | 公开清单 API、固定照片 ID、分页，保留摄影师和原始照片来源 |
| Wikimedia Commons | 官方 MediaWiki API；筛选横向、足够尺寸、明确 CC BY/CC BY-SA/公共领域许可的位图，保留每张图的文件页和许可 |

Unsplash/Pexels 原先只有网站外链的栏目已删除，不再以入口数量代替可用图库。用户已有桌面收藏不受影响。没有增加其他需要未配置密钥、许可用途不明确或无法直接加载图片的占位来源。

## deepin 与 Wallhaven 如何工作

deepin 使用官方 `linuxdeepin/deepin-wallpapers` 仓库提交 `caae39a555fbeac36da0cacc0fd00d73b2706c7e` 的 `deepin/` 目录。官方 `.reuse/dep5` 对这些 JPG/PNG 声明 CC BY 4.0；不读取 `nonfree/` 中的受限图片。固定版本避免将未复核的新素材自动加入；图片文件留在原站，不复制到栖页仓库。该来源没有独立缩略图服务，故每页限制 4 张并懒加载。

Wallhaven 使用官方 API 返回的真实 `path`、`thumbs.large`、尺寸、SFW 标记和来源页。本次响应可正常读取，但未返回允许 Pages origin 的 CORS 响应头。因此采用带日期的元数据快照，而不是客户端重复发注定失败的跨域 API 请求。图片可单独从 `th.wallhaven.cc` / `w.wallhaven.cc` 加载。**图片版权仍归原权利人，不代表可以全部商用或重新分发。** 所有条目保留来源与版权提示，不提供绕过鉴权的内容。

源码 `wallpaper-catalog.js` 仅包含元数据清单。新版本维护者可核验上游后更新日期与条目；当前没有定时后台更新、第三方代理、隐藏 API key 或自建图床。旧条目应保留以兼容已有壁纸备份；需要移除时应设计迁移，不能随意使旧备份失效。

## 隐私与性能

默认不请求图库。主动进入在线来源且启用后才加载；桌面卡片是入口，不预拉整库。API 清单缓存只保留最近 5 个“来源 + 页码”。缩略图懒加载；选择图片后才预载完整背景。切换来源和关闭弹窗取消旧任务；失败保留背景，不提示假成功。

Picsum 使用 `/v2/list`。Commons 每页最多 18 张、640 缩略图；应用时使用 API 实际返回的高清 URL。Commons 超时约 12 秒、文本响应上限 2 MiB；完整背景预载期限 15 秒。Deepin 单张选择不超过 2.5 MB，Wallhaven 快照仅收录不超过 12 MiB 的原文件元数据；上游实际响应仍受浏览器策略影响。

请求不携带搜索词、便签、WebDAV 凭据或整个桌面清单。图片主机可看到客户端 IP 和普通请求信息。图库许可与 GPLv3 分开，不把所有外部图片重新标记为 GPL。

## 新来源的实现合同

只有能在面板中直接浏览/应用的来源才进入 `WALLPAPER_SOURCES`。API 或已审查元数据快照都可设置 `endpoint: true` 并提供 fetcher；快照还须 `snapshot: true`、明确日期/来源说明和分页上限。不再添加仅外链栏目。

标准记录：`provider,id,title,author,width,height,url,thumbnail,sourceUrl,license,licenseUrl`。在 `wallpapers.js` 接入 `normalizeWallpaperPhoto()`，逐项校验 URL、域名、端口、路径、尺寸、图片 ID 与来源；目录来源必须匹配可信条目，不能把导入备份中的任意 URL 视作可信背景。

fetcher 支持 `{page, signal}` 并返回有界数组。网络错误抛给界面；请求不能在 render 中触发；用户同意须成功保存后才继续。API key 不得进静态 Pages、Git、桌面 JSON 或日志。需要密钥的新服务先设计本机配置/合规用途，不能共享硬编码密钥。

本轮只新增并验证两个明确来源，没有声明“所有热门图库均支持”。新增来源应提交真实接口/许可证据，以及分页、取消、失败和深浅主题测试。

## 官方资料

- deepin 图片授权：https://github.com/linuxdeepin/deepin-wallpapers/blob/master/.reuse/dep5
- Wallhaven API：https://www.whvn.cc/help/api （原站说明图片版权仍归原权利人）
- Picsum：https://picsum.photos/
- MediaWiki：https://www.mediawiki.org/wiki/API:Imageinfo
