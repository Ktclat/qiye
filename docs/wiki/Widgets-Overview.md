# 组件概览与架构

组件文档随组件源码在独立仓库维护。[qiye-widgets / Widgets-Overview](https://github.com/Ktclat/qiye-widgets/blob/main/docs/wiki/Widgets-Overview.md)

[宿主 API 与仓库边界](../PLUGIN-API.md)。

## 桌面拖动与右键菜单

2026-10-24：保留用户 iTab 参考中的紧凑卡片和无额外拖动按钮的布局。网站可直接拖动，小组件默认长按 200ms 起拖；文字选择、短按输入和控件操作继续由组件处理。沿用现有指针控制器、屏幕坐标映射和保留 iframe 的换位方式；真实浏览器检查未发现需要更换排序实现的问题。

公开交互参考：[SortableJS 网格与共享列表示例](https://sortablejs.github.io/Sortable/)。依据 [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)、[指针捕获](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) 和 [W3C Pointer Events](https://www.w3.org/TR/pointerevents/latest/)，验证长按、触控滚动、释放、Escape / pointercancel 与不同缩放坐标；沿用移动阈值和文件夹悬停等待，避免抖动换位与普通拖动误建文件夹。

修复宿主右键菜单未在早返回的点击处理和隔离组件内收起的问题：宿主页按下菜单外部即关闭，键盘生成的点击使用同一边界；组件通过既有可信交互端口通知宿主关闭。关闭不重设焦点，保持便签输入与短按按钮行为。菜单内部点击仍正常执行，Escape 返回原项目，长菜单可滚动。依据 [MDN contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)，分别测试鼠标右键与 Shift+F10；不以鼠标事件替代键盘流程。

回归入口：`tests/desktop-interactions-e2e.py` 支持源码、`--preview`、`--live` 和 `--extension 解压目录`；真实官方组件由 `tests/widget-interactions-e2e.py`、`tests/widget-long-press-e2e.py` 与 `tests/widget-drag-stability-e2e.py` 验证。打包版本保留固定扩展身份；安装与更新见 [UPDATING](../../UPDATING.md)，验证记录见 [QA](../QA.md)。

## 统一弹窗标题栏

2026-10-24：将文件夹窗口的 46px 单行标题栏扩展到网站编辑、分组、移动、本地搜索、组件配置、恢复备份、同步确认和普通确认。较长的说明移至正文，完整标题保留在悬停提示中，右侧关闭按钮始终可见。设置（侧栏 / 窗口）与壁纸库采用相同标题栏，当前分类或来源放在标题旁，移除导航中的重复大标题；分类导航与正文分别滚动。

视觉依据延续用户的 iTab 参考和文件夹截图，并核对 [iTab 公开帮助](https://go.itab.link/help)。依据 [WAI-ARIA 模态对话框模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)，设置、图库和确认窗初始聚焦静态标题，表单与搜索保留输入焦点，宿主弹窗的 Tab / Shift+Tab 在可用控件之间循环，Escape 返回入口。[MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) 用于区分指针与键盘操作；关闭按钮不出现初始焦点框。小组件自身负责隔离页面内的键盘交互。

添加内容、书签导入及小组件主窗口已经使用 44–48px 标题栏；独立组件库 1.0.11 同步补齐收藏编辑、热搜订阅管理、倒数日和世界时钟的内层弹窗。保持组件固定版本机制：已安装组件通过组件源详情主动更新。验证范围见 [QA](../QA.md)。

## 宿主文件夹窗口

2026-10-24：沿用用户提供的 iTab 参考与文件夹截图，以网站图标网格为主体；浏览和编辑共用 46px 单行标题栏，左侧名称与数量，右侧编辑、关闭。紧凑窗口不再重复展示大标题说明和底部完成按钮。桌面四列，窄窗口三列或两列；网站较多时仅滚动内容区，空文件夹保留拖入提示。使用已有窗口主题表面，避免桌面图标透过面板干扰阅读。

参考 [iTab 公开使用帮助](https://go.itab.link/help) 的文件夹入口；键盘交互依据 [WAI-ARIA 模态对话框模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)，首次聚焦静态标题、Tab 在窗口内循环、Escape 关闭后返回入口。依据 [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) 区分鼠标与键盘焦点；网站图标和名称共用链接及右键菜单，Shift+F10 可打开同一菜单。验证范围见 [QA](../QA.md)。
