# 栖页文档

> **v0.10.0 仓库拆分：** 主程序不附带组件实现。官方源预置但默认关闭；在设置中启用后添加组件。旧实例与数据保留。组件开发和发布转至 [qiye-widgets](https://github.com/Ktclat/qiye-widgets)，当前契约见 [宿主 API](PLUGIN-API.md)。

[项目首页](../README.md) · **简体中文** · [English](README.en.md)

从使用指南了解产品，从小组件 Wiki 开始扩展开发。技术文档描述当前源码；历史版本说明和测试结论单独归档。

## 使用与配置

| 文档 | 内容 |
| --- | --- |
| [使用指南](GUIDE.md) | 安装、桌面设置、快捷键、图标与 WebDAV |
| [功能范围](FEATURES.md) | 已有能力、设置分类与产品边界 |
| [隐私说明](PRIVACY.md) | 本地数据、权限、第三方请求与同步 |
| [社区与分享](COMMUNITY.md) | 订阅组件、运行网页组件、导出与导入排布 |
| [壁纸](WALLPAPERS.md) | 壁纸中心、数据来源与接入约束 |
| [图片压缩](IMAGE-COMPRESSION.md) | 本地图片压缩小组件、壁纸自动压缩和无损边界 |

## 小组件技术 Wiki

文档源文件位于 [wiki/](wiki/Home.md)，中英文页面逐篇对应，支持仓库内阅读和发布到 [GitHub Wiki](https://github.com/Ktclat/qiye/wiki)。

| 主题 | 中文 | English |
| --- | --- | --- |
| 导航与阅读路线 | [首页](wiki/Home.md) | [Home](wiki/Home-en.md) |
| 架构、组件目录与数据模型 | [组件概览](wiki/Widgets-Overview.md) | [Overview](wiki/Widgets-Overview-en.md) |
| 原生 API v3 与生命周期 | [原生组件](wiki/Native-Widgets.md) | [Native widgets](wiki/Native-Widgets-en.md) |
| 清单、SDK 与隔离协议 v1 | [社区组件](wiki/Community-Widgets.md) | [Community widgets](wiki/Community-Widgets-en.md) |
| 验证、排错与提交 | [测试与贡献](wiki/Widget-Testing.md) | [Testing and contributing](wiki/Widget-Testing-en.md) |

## 开发与维护

| 文档 | 内容 |
| --- | --- |
| [开发指南](DEVELOPMENT.md) · [贡献约定](../CONTRIBUTING.md) | 本地环境、源码职责与提交流程 |
| [图标技术说明](FAVICONS.md) · [国际化](I18N.md) | 图标获取、缓存、翻译与格式化 |
| [Wiki 维护](WIKI.md) | 双语约定、链接转换与 Wiki 发布 |
| [更新日志](../CHANGELOG.md) | 按版本倒序维护用户可见变化 |
| [发布指南](RELEASES.md) · [部署指南](DEPLOYMENT.md) · [分支约定](BRANCHES.md) | 分发包、GitHub Releases 与 Pages |
| [第三方声明](THIRD_PARTY.md) · [许可证](../LICENSE) | 依赖来源与许可 |

## 验证与历史资料

[QA.md](QA.md) 汇总近期实测与尚未验证的边界。`QA-v*.md`、`REVIEW-v*.md` 是对应版本的历史记录，不作为当前 API 的说明。产品需求背景见 [REQUIREMENTS.md](../REQUIREMENTS.md)。

新增文档请同步本索引；新增版本只写入更新日志，发布步骤维护在发布指南中。文档组织参考 [Refined GitHub](https://github.com/refined-github/refined-github) 的安装与功能入口，以及 [Immich](https://github.com/immich-app/immich) 的语言切换与专题文档导航。
