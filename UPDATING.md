# 安装与更新 / Installing and updating Qiye

## 为什么扩展管理页出现两个栖页？

浏览器通过扩展 ID 区分安装。0.10.9 及更早版本没有固定的公开身份密钥；把不同版本的 ZIP 拖入浏览器，或加载不同的解压目录，可能生成不同的 ID。版本号变大不会把两个不同 ID 的扩展合并。

从 **0.10.10** 起，官方本地安装包保持固定 ID `olphdlcjiaijcppklllciaeaonbbjjia`。打包程序会校验身份，后续版本不再因为解压路径不同而生成新的 ID。公开 `key` 用于本地安装身份，不是签名、商店认证或自动更新服务。

## 从 0.10.9 或更早版本迁移（只做一次）

1. 暂时保留旧安装。在浏览器扩展列表找到有原数据的栖页，使用它的新标签页，进入 **设置 → 备份与恢复 → 导出 JSON**。如果已经有两个栖页，分别导出各自需要的内容；请勿先卸载。
2. 下载新版 `qiye-X.Y.Z-chrome-edge.zip`，解压到长期保留的目录，例如 `D:\Apps\Qiye`。在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式，选择 **加载已解压的扩展程序**，选中包含 `manifest.json` 的目录。
3. 在新版 **设置 → 备份与恢复** 导入刚才的备份，确认网址、分组、便签、待办和当前壁纸。导入会替换当前桌面，不会自动合并两份备份。
4. 重新启用需要的组件源并按需授权。WebDAV 连接、权限、组件的额外设备存储及未使用的本地壁纸库不包含在桌面备份中；这些内容需在旧版另行保留或重新配置。
5. 确认需要的内容已迁移后，再移除不需要的旧安装。不同 ID 之间无法直接访问对方的浏览器存储。

即使把带固定 `key` 的新版覆盖到旧版原目录，首次迁移仍会改变旧版 ID，因此仍应先备份。不要清除浏览器数据来“修复”重复安装。

## 0.10.10 及后续版本之间更新

1. 保存正在编辑的内容，导出一份桌面备份，然后关闭栖页标签页。
2. 将新 ZIP 的内容覆盖到**原安装目录**，保留目录路径，不先卸载扩展。
3. 在扩展管理页找到现有栖页，点击 **重新加载 / Reload**，再新建标签页并核对版本号。固定 ID 下的浏览器存储继续保留。

部分 Chromium 浏览器允许拖入 ZIP；固定 ID 避免把新目录识别为另一个扩展，但浏览器对拖入 ZIP 的支持不同。统一推荐以上“覆盖原目录 + 重新加载”的更新流程。开发者模式安装不会像商店安装那样自动下载 GitHub 版本；扩展管理页的“更新”按钮也不是 GitHub ZIP 升级器。

**小组件单独更新：** 设置 → 组件源 → 查看组件详情 → 检查更新 → 更新已添加的组件。无需重新安装主程序。`qiye-widgets-X.Y.Z.zip` 是供自行部署组件源的网页资源包，不能作为浏览器扩展安装。

## English

Before 0.10.10, Qiye had no fixed manifest key: loading another extraction folder could create a second extension ID. Version numbers alone do not merge separate installations.

Starting with 0.10.10, local distribution packages use the permanent ID above. **When migrating from an older release, export your desktop from the old installation before changing files or uninstalling it.** Install the new release, import the JSON in Settings → Backup and restore, and verify your content before removing an old copy. Imports replace the current desktop; they do not merge multiple backups. Re-enable widget sources and permissions. WebDAV credentials, extra device-local widget storage and unused wallpaper-library entries need separate handling.

For subsequent updates, keep the same installation folder, close Qiye tabs, replace its files with the new ZIP contents, and choose **Reload** on the existing extension card. Keep the extension installed so its storage is retained. ZIP dragging varies by browser; this manual installation does not provide automatic GitHub updates. Widget releases are updated separately in Settings → Widget sources.

## 技术依据

- [Chrome manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)：为本地安装提供一致的扩展 ID。
- [Microsoft Edge 本地安装与 Reload](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)：更新原目录并重新加载。
- [Chromium 扩展身份实现](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/extension.cc)：有 key 时从公开密钥生成 ID，否则使用路径生成 ID。

2026-10-21：采用固定公开身份、构建校验及一次性备份迁移。保持浏览器权限不变，不申请管理或卸载其他扩展的权限，不读取另一安装的数据。未来商店分发或签名 CRX 需单独规划身份迁移，不能声称此公开 key 提供了签名能力。
