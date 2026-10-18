# Qiye Widgets

小组件源码、清单、资源、测试和独立发布已迁移到 [Ktclat/qiye-widgets](https://github.com/Ktclat/qiye-widgets)。

本文档现位于 [qiye-widgets/docs/WIDGETS.md](https://github.com/Ktclat/qiye-widgets/blob/main/docs/WIDGETS.md)。主程序宿主接口见 [PLUGIN-API.md](PLUGIN-API.md)。

## 组件源与添加界面（2026-10-18）

根据用户提供的四张截图，来源管理收回到“组件源 → 查看组件详情”，总览不混排组件；添加页恢复卡片画面、尺寸切换与紧凑的 46px 标题栏。分类按全部、官方源、社区源和各自定义来源组织；不是由作者自报“官方”身份。桌面圆角继续使用原桌面样式的 20px / 窄屏 16px，移除覆盖它的 `inherit` 规则，嵌入网页由宿主裁切。

公开设计参考：[iTab 官方卡片式组件示例](https://itab.link/)。技术依据：[MDN border-radius](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-radius)、[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)、[WAI 按钮键盘交互](https://www.w3.org/WAI/ARIA/apg/patterns/button/)。筛选采用原生按钮和 `aria-pressed`，保留 Tab、Enter、Space 和 `:focus-visible`；预览不加入键盘顺序。只有靠近可视区域的预览才挂载，关闭、隐藏和滚动离开后回收。

打开组件时，宿主先显示同主题的加载界面，收到组件就绪消息后再显示 iframe，避免露出空白文档。组件库 v1.0.1 将约 1.85 MB 内联入口拆成轻量 HTML 与同版本共享 JS/CSS，使不同组件和重复打开窗口可以复用缓存。依据：[V8 官方代码缓存说明](https://v8.dev/blog/code-caching-for-devs)、[MDN script / defer](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script)。首次加载仍依赖网络，实际收益取决于浏览器缓存和网络，未引入同源权限或宿主远程脚本执行。

行为和验证入口见 [COMMUNITY.md](COMMUNITY.md)。

缓存验证使用真实 HTTP 缓存，不启用会禁用缓存的浏览器请求拦截：同一页面依次打开便签卡片、便签窗口、日历卡片和日历窗口，两份共享资源均只传输一次。此结果验证复用行为，不作为公网耗时承诺。独立组件库的 `tests/cache-e2e.py` 与全部组件尺寸/主题回归随发布运行。
