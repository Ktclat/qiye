# 独立发布与下载包

主程序 [qiye](https://github.com/Ktclat/qiye) 与组件库 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 分别发布、分别编号，不互相触发工作流，也不互相检出源码。组件功能修改只需要发布组件库；修改宿主 API 或桌面行为时才发布主程序。

## 主程序流程

本地分发身份从 0.10.10 起固定，见 [安装与升级](../UPDATING.md)。`manifest.json` 中的公开 `key` 与 `extension-identity.json` 不随版本轮换；构建、打包和回归会核对 ID。发布包及发布说明必须保留旧版首次迁移的备份提醒。普通版本升级不能通过重新生成身份来解决安装问题。

1. 从 main 创建短期 `codex/功能名` 分支，修改、测试并合入主线。
2. 需要发布时同步修改 `manifest.json`、`package.json` 版本，更新 [CHANGELOG](../CHANGELOG.md)，执行 `python scripts/build-preview.py`，提交生成预览和版本文件。
3. 推送匹配的 `vX.Y.Z` 标签。CI 验证逻辑、文档、协议夹具、真实 MV3、桌面交互，成功后发布扩展 ZIP、对应源码 ZIP、独立预览与 SHA256。

```sh
npm test
python scripts/build-preview.py
python scripts/package-release.py
# 完成代码提交和合并后，替换为实际版本
git tag vX.Y.Z
git push origin vX.Y.Z
```

普通 main 提交不创建 Release；验证成功后更新公开网页。PR / workflow_dispatch 只验证。已公开的版本标签和资产不覆盖；修复应发布新版本。版本三段必须与 Chrome 版本规则相符。

## 组件流程

组件仓库包含自己的 package、manifests、tests、构建脚本和发布 workflow。发布时统一更新组件清单 release 与固定入口，推送该仓库的版本标签。CI 保存旧版本目录并部署 Pages。增加组件不会改变扩展版本。

## 迁移与回退

升级主程序会保留原桌面记录；旧组件显示启用来源提示。用户启用官方源后组件库读取旧数据，首次保存时写成固定版本插件记录。来源设置是设备本地配置，不随导入或 WebDAV 自动启用。

目录刷新只更新可用版本，已安装组件需手动更新。更新前导出桌面备份；可还原备份恢复旧清单。固定版本源也可独立订阅。协议详情和网络边界见 [PLUGIN-API](PLUGIN-API.md)。
