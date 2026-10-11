# 第三方字体与素材说明

## Inter 可变字体

栖页随附 Inter 的拉丁字符子集，用于界面的拉丁字母、数字和标点。中文与未包含的字符使用设备已有的系统字体，不附带完整的中文字库。

| 项目 | 内容 |
| --- | --- |
| 字体 | Inter，正体可变字体，字重 100–900 |
| 作者 | The Inter Project Authors；项目由 Rasmus Andersson 发起 |
| 本地文件 | [`fonts/inter-latin-variable.woff2`](../fonts/inter-latin-variable.woff2) |
| 文件大小 | 72,920 字节，约 71.21 KiB |
| 许可 | SIL Open Font License 1.1（OFL-1.1） |
| 完整许可 | [`fonts/OFL-Inter.txt`](../fonts/OFL-Inter.txt) |
| 获取日期 | 2026-10-12（香港时间） |
| SHA-256 | `2c295d99e26dcf357d4d01bcf270fd6924b600c9a13dd8c363ef114f4c6976fa` |

官方来源：

- [Inter 项目官网](https://rsms.me/inter/)
- [Inter 上游源码仓库](https://github.com/rsms/inter)
- [Google Fonts 的 Inter 页面](https://fonts.google.com/specimen/Inter)
- [本次使用的 Google Fonts CSS 清单](https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap)
- [本次下载的 WOFF2 原文件](https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcviYwY.woff2)
- [Google Fonts 对应字体包的 OFL 许可](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt)

字体文件直接保存自 Google Fonts 官方分发的 `latin` 子集，没有重新绘制字形、转换格式或进一步裁剪。CSS 清单声明其字重范围为 100–900；请求同时包含 14–32 的光学字号范围。`v20` 是分发 URL 中的版本标识，不应解释为 Inter 项目的字体版本号。

随附的许可来自同一 Google Fonts 字体包，保留其 `Copyright 2020 The Inter Project Authors` 版权声明。OFL 1.1 允许字体随软件嵌入、分发及用于商业项目，但不得单独出售字体，分发时须保留版权声明和许可。字体本身继续适用 OFL 1.1，不因项目源代码的许可而重新授权。完整条件以随附许可原文为准。

扩展与演示页从本地文件或构建时嵌入的数据加载该字体，运行时不需要向 Google Fonts 或字体作者的网站发送请求。将字体嵌入单文件演示页时，分发物同样需要保留其版权声明和完整许可。

## 字体范围与回退

Google Fonts 的 `latin` 子集包含基本拉丁字母、数字及常用标点。参考的 CSS 字符范围为：

```text
U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F,
U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD
```

系统字体名称只作为 CSS 回退使用，不表示栖页复制或重新分发了这些字体文件。

## 界面对照与站点图标

栖页参考 iTab 公开界面的布局密度与交互方式，以独立代码实现。项目没有复制或分发 iTab 的商标、Logo、专有字体文件、壁纸素材或产品源码，也不代表与 iTab 存在关联或获得其背书。

网站与搜索引擎图标按用户添加的站点地址加载，用于识别对应网站；相关图标及商标归各自权利人所有。自定义头像由用户自行选择，在本机裁切和编码，保存在用户的本地桌面数据中，也会随用户主动使用的 JSON 备份和 WebDAV 同步。

## 网页材质

界面的毛玻璃、亚克力与 Mica 风格使用 CSS 和项目自身样式实现。Mica 风格表示柔和着色的视觉参考，不是 Windows 原生 Mica API，也没有从参考产品提取材质贴图。纯色与 Mica 风格不使用背景模糊，毛玻璃和亚克力的模糊强度由用户设置。


## GPLv3 与素材的界限

栖页原创程序以 GPL-3.0-only 发布，根目录 LICENSE 保留完整许可。此授权不改变 Inter 的 OFL-1.1，也不包含对目标网站商标/图标、用户头像/照片或远端图库素材的再授权。Commons 的图片逐张保留作者、文件页和许可；Picsum 原图遵循对应来源条件。具体获取方式和参考条款见 [WALLPAPERS.md](WALLPAPERS.md)。
