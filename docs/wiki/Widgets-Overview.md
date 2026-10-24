# 组件概览与架构

组件文档随组件源码在独立仓库维护。[qiye-widgets / Widgets-Overview](https://github.com/Ktclat/qiye-widgets/blob/main/docs/wiki/Widgets-Overview.md)

[宿主 API 与仓库边界](../PLUGIN-API.md)。

## 宿主文件夹窗口

2026-10-24：沿用用户提供的 iTab 参考与文件夹截图，以网站图标网格为主体；浏览和编辑共用 46px 单行标题栏，左侧名称与数量，右侧编辑、关闭。紧凑窗口不再重复展示大标题说明和底部完成按钮。桌面四列，窄窗口三列或两列；网站较多时仅滚动内容区，空文件夹保留拖入提示。使用已有窗口主题表面，避免桌面图标透过面板干扰阅读。

参考 [iTab 公开使用帮助](https://go.itab.link/help) 的文件夹入口；键盘交互依据 [WAI-ARIA 模态对话框模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)，首次聚焦静态标题、Tab 在窗口内循环、Escape 关闭后返回入口。依据 [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) 区分鼠标与键盘焦点；网站图标和名称共用链接及右键菜单，Shift+F10 可打开同一菜单。验证范围见 [QA](../QA.md)。
