# 壁纸中心与来源接入

## 用户入口

点击桌面的“发现壁纸”组件或右上角壁纸按钮，打开同一个左右布局窗口。左侧选择来源，右侧展示内容；参数按钮固定在左栏底部。关闭弹窗或切换来源会取消旧的清单/高清解析任务。

| 来源 | 本版行为与边界 |
| --- | --- |
| 自定义背景 | 在本机读取图片/视频，最大 4 MiB，进入用户桌面备份与 WebDAV |
| 官方背景 | 6 款栖页内置 CSS 渐变；不是 iTab 私有壁纸库，离线可用 |
| Lorem Picsum | 明确启用后调用公开清单 API，固定图片 ID，保留摄影师与原图来源 |
| Wikimedia Commons | 官方 MediaWiki API；筛选横向、足够尺寸、明确 CC BY/CC BY-SA/公共领域许可的位图，逐张保留作者与许可链接 |
| Unsplash / Pexels | 原网站入口，不伪装成已接通的 API；在原网站获得授权图片后可本地导入 |

在线服务需要网络，部分区域可能访问失败。空列表、限流、跨域或错误不会变成“已应用”。完整图片加载成功且设置/请求仍是当前选择时才切换；失败保留原背景。用户关闭在线图片开关后停止以在线照片作背景，并恢复本地或内置背景。

## 隐私与性能

默认不请求图库。只有主动进入在线来源并启用后才读取清单；桌面上的组件本身是入口，不在每次新标签页自动拉取列表。图库缓存只保留最近 5 个“来源 + 页码”，不进入同步。缩略图 lazy loading；仅选择某张图片时加载高清图。

Picsum 使用 `/v2/list`，保留其生成的标准尺寸地址。Commons 清单每页最多 18 条，查询缩略图宽度 640；应用时请求 1920 规格，使用 API 真正返回的 URL，而不是猜测缩略图路径。返回尺寸可能高于请求尺寸。Commons 请求上限约 12 秒、响应长度校验 2 MiB；桌面应用预载上限 15 秒。没有自动重试风暴、批量抓取和持续全屏模糊动画。

浏览器直接连接所选服务，可见 IP、必要请求头和所请求的图片。图库请求设 `credentials: omit` 和 `referrerPolicy: no-referrer`，不转发搜索词、桌面清单或 WebDAV 认证信息。图片本身受各自许可约束，不因栖页 GPLv3 而重新许可。

## 新来源如何加入

在 `WALLPAPER_SOURCES` 声明导航条目。只有经过审查的 API 来源才设置 `endpoint: true`，并提供 fetcher 返回标准化图片数组。无需或尚未完成 API 授权的网站应作为明确的外链入口，不能使用网页代理绕过 CORS/授权。

标准记录包含 `provider,id,title,author,width,height,url,thumbnail,sourceUrl,license,licenseUrl`。在 `wallpapers.js` 新增标准化函数并接入 `normalizeWallpaperPhoto()`，校验 HTTPS、域名、端口、路径、尺寸、ID 与来源一致性；core 会通过这层校验处理远程壁纸备份。严禁把任意响应里的 URL 直接作为背景/HTML。

支持 `{page, signal}`，返回有边界的数组；错误抛给面板显示；不能在 renderer 发请求。需要 API key 的提供方不可将 key 写到静态 Pages、git、JSON 桌面或错误日志。应先讨论安全的用户自配/服务端方案，不把共享私钥放入扩展。

## 官方参考与许可

- [Picsum 文档](https://picsum.photos/)；[Unsplash License](https://unsplash.com/license)。
- [MediaWiki Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)；每张 Commons 图的文件页和许可链接才是实际使用依据。
- [Pexels API 规则](https://www.pexels.com/api/documentation/) 与 [壁纸用途说明](https://help.pexels.com/hc/en-us/articles/4405588861721-Can-I-use-the-API-as-a-wallpaper-app)。本版不调用该 API，不承诺授权豁免。
