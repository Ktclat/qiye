# Qiye Widgets

## 缓存、授权与书签导入（主程序 0.10.9，2026-10-21）

用户最后确认长按为 **0.2 秒**。设置 → 打开方式 → 长按拖动时间提供 0.1、0.2、0.4、0.6、1、1.5、2、3 秒；旧备份缺少该字段时迁移到 200ms，非法类型与越界值仍拒绝。保留屏幕坐标锚点、7px 移动取消容差及无按钮卡片，右键菜单提供组件专属命令与授权管理。本文后面的 320/400ms 为历史决策。

触屏模拟器和部分隐私模式不提供屏幕坐标时，不再移动正在发送局部坐标的 iframe；使用标题拖影并在松手时提交顺序，消除异步坐标与移动文档之间的反馈偏移。正常提供屏幕坐标的鼠标与触屏仍使用原卡片画面跟随拖动。

切换分组通过 `moveBefore` 将离屏卡片放入连接中的隐藏、inert 容器，最多保留 24 张；返回时复用同一文档。删除、来源停用或版本变更仍销毁旧实例。旧浏览器使用安全重建路径，但可从本机资源缓存启动。

来源明确启用后，组件 HTML 与同源经典 JS/CSS 按入口和 release 保存到 IndexedDB `qiye.widget-cache.v1`；官方组件共用同版本运行包。读取不带 Cookie、禁止重定向，单包约 12 MiB、磁盘共 32 MiB/6 包；完整下载后原子写入，相同下载共享请求。首次读取最多 60 秒，远程回退整体最多 90 秒；文档就绪后另给 20 秒握手。已有缓存不先联网校验，升级以用户明确更新的清单为界。

扩展使用声明的 `widget-sandbox.html`；网页/独立预览使用保持 secure context 的 opaque `srcdoc`，避免 `data:` 文档丢失复制和 UUID 能力。缓存内容只在沙箱执行。沙箱内 URL 适配将 `new URL(location.href)` 映射到原入口，保留旧运行包的组件查询参数；真实 Location、origin 和权限不变。外部经典脚本转换为沙箱内 data 资源，保留 defer/async/nomodule；模块、SRI、独立 CSP、嵌套 frame 等不兼容文档保留远程路径。依赖其他 Location 属性、动态 import、远程图片或数据的社区组件不承诺完整离线。天气、榜单、地图、汇率的实时数据仍需网络。

设置 → 授权管理列出书签、历史、定位、热榜及已授予的可选站点权限。导入/搜索、WebDAV、自定义来源、图标提取和热榜处提供撤销或管理入口；组件右键也可进入。`chrome.permissions.remove` 撤销权限，`onRemoved` 同步其他标签页；同时清除来源级书签/定位标记、停止相关会话、丢弃迟到结果、暂停 WebDAV 自动同步。网页定位还可在浏览器站点设置取消浏览器自身许可；必要安装权限不能逐项撤销。已导入桌面链接保留。

热榜说明区分授权能力与当前实现：“读取和更改 uapis.cn 上的数据”是域名级能力，不是读取所有网站；当前实现仅 GET 固定公开榜单接口，不带 Cookie，不提供任意 URL 代理。浏览器不能只授予某个接口的 GET 权限。

书签导入采用 46px 单行标题栏、胶囊搜索、文件夹筛选、列表多选与固定底部导入区。跨筛选保留选择，支持选择筛选结果和目标分组重复标记；初次渲染 100 行，按需增加。窄屏文件夹横排，原生复选框与键盘焦点保留，初次聚焦标题。只显示本机生成的站点字母标记，不因预览就请求收藏网站。

研究依据与决策：

- [iTab 官方示例](https://itab.link/)：紧凑布局；用户截图是具体视觉基线。
- [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) 和 [跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)：站点级授权、用户手势申请、contains/remove/onRemoved。
- [Chrome sandbox](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox) 和 [CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)：主程序 `script-src 'self'` 不变，缓存仅在无同源权限的沙箱执行。
- [Microsoft Webview 示例](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample) 和 [MDN moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)：生命周期、有限通信、保留 iframe 状态及兼容回退。
- [Chrome Bookmarks API 与示例](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)：保留文件夹路径，将明确选择的书签复制到桌面。

验证：`tests/widget-cache-e2e.py`（源码、`--preview`、`--extension`），覆盖 16 秒首次延迟、三份共享资源、跨分组同文档、离线刷新/新标签页、保存、secure context 和父 DOM 隔离；`tests/bookmark-import-e2e.py` 覆盖 425 条书签、筛选多选、重复、导入、撤销、200ms 默认及持久化、深浅/390px。单位测试覆盖备份迁移与撤销后的缓存/迟到热榜响应；原拖动稳定性、协议、真实 MV3 和预览回归继续运行。

小组件源码、清单、资源、测试和独立发布已迁移到 [Ktclat/qiye-widgets](https://github.com/Ktclat/qiye-widgets)。

本文档现位于 [qiye-widgets/docs/WIDGETS.md](https://github.com/Ktclat/qiye-widgets/blob/main/docs/WIDGETS.md)。主程序宿主接口见 [PLUGIN-API.md](PLUGIN-API.md)。

## 组件源与添加界面（2026-10-18）

根据用户提供的四张截图，来源管理收回到“组件源 → 查看组件详情”，总览不混排组件；添加页恢复卡片画面、尺寸切换与紧凑的 46px 标题栏。分类按全部、官方源、社区源和各自定义来源组织；不是由作者自报“官方”身份。桌面圆角继续使用原桌面样式的 20px / 窄屏 16px，移除覆盖它的 `inherit` 规则，嵌入网页由宿主裁切。

公开设计参考：[iTab 官方卡片式组件示例](https://itab.link/)。技术依据：[MDN border-radius](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-radius)、[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)、[WAI 按钮键盘交互](https://www.w3.org/WAI/ARIA/apg/patterns/button/)。筛选采用原生按钮和 `aria-pressed`，保留 Tab、Enter、Space 和 `:focus-visible`；预览不加入键盘顺序。只有靠近可视区域的预览才挂载，关闭、隐藏和滚动离开后回收。

打开组件时，宿主先显示同主题的加载界面，收到组件就绪消息后再显示 iframe，避免露出空白文档。组件库 v1.0.1 将约 1.85 MB 内联入口拆成轻量 HTML 与同版本共享 JS/CSS，使不同组件和重复打开窗口可以复用缓存。依据：[V8 官方代码缓存说明](https://v8.dev/blog/code-caching-for-devs)、[MDN script / defer](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script)。首次加载仍依赖网络，实际收益取决于浏览器缓存和网络，未引入同源权限或宿主远程脚本执行。

行为和验证入口见 [COMMUNITY.md](COMMUNITY.md)。

缓存验证使用真实 HTTP 缓存，不启用会禁用缓存的浏览器请求拦截：同一页面依次打开便签卡片、便签窗口、日历卡片和日历窗口，两份共享资源均只传输一次。此结果验证复用行为，不作为公网耗时承诺。独立组件库的 `tests/cache-e2e.py` 与全部组件尺寸/主题回归随发布运行。


## 组件交互与控件修复（2026-10-19）

以用户提供的六张截图和 [iTab 官方组件示例](https://itab.link/) 为视觉基线。标题栏保持 46px；普通图标按钮为 32px、SVG 为 18px / 1.7px 描边；卡片按钮按紧凑尺寸缩小。搜索采用圆角胶囊、统一主题强调色；鼠标操作不强制显示键盘焦点，Tab 操作保留 `:focus-visible`。独立组件库将这些规则集中在 `src/widget-controls.css`，齿轮使用共享图标路径。

- 随手记的纸色覆盖整个窗口与标题栏；移除背景套纸卡的嵌套边框，正文独立滚动，字数和保存状态固定在底部。
- 待办使用工具栏、任务列表与底部输入区；设置放入齿轮。修复列表最小宽度、输入内边距、横向溢出、删除按钮负外边距和 SVG 尺寸，保留键盘操作与筛选。
- 文件转换卡片使用两张格式图形和转换箭头，适配 1×1、1×2、2×1、2×2、4×2；转换仍在本机进行。
- 世界时钟通过 `config.columns` 保存 1/2/3 列，旧数据默认 2 列。窄窗口自动降列但不修改偏好；城市顺序、主城市、时间比较与 IANA 时区计算保持不变。
- 普通操作提示约 3 秒后消失；可撤销提示保留 8 秒。输入错误、加载状态与持续保存状态保留其原有语义，不用全局计时器抹去业务内容。

### 根因与技术决策

热榜接口实测对 `Origin: null` 不返回 CORS 授权头，正常网页来源可读取；隔离 iframe 恰好使用不透明来源。参考 [MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin) 与 [UAPI 热榜官方文档](https://uapis.cn/docs/api-reference/get-misc-hotboard)，宿主新增 `hotboard` 调用，只接受固定平台枚举并请求固定 HTTPS 路径，不接受自定义 URL、凭据或请求头。宿主负责 1 MiB 限制、超时、短时请求合并；组件保留 10 分钟缓存、失败时的旧数据与手动重试。自定义数据源仍使用自己的 CORS。扩展版通过窗口标题栏的“授权热榜访问”只申请该 API 域名，然后自动刷新；网页版无需扩展授权。直接用 file:// 打开预览时，联网服务仍受不透明来源的 CORS 限制，联网验收使用 HTTP 预览和公开网页。

iframe 内的 DOM 事件不冒泡到桌面，导致组件分仓后丢失拖动和右键菜单。现在使用已有实例 MessagePort 转发经过模式与坐标校验的指针/菜单事件；文本输入保留原生编辑菜单，卡片长按交互已按下文“无按钮长按拖动”更新。依据 [MDN Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) 与 [moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)，支持时原位移动 iframe，避免重新加载编辑器。菜单使用 [WAI Menu Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) 的方向键、Escape 和焦点返回；支持 Shift+F10，桌面继续支持 Alt+方向键排序。

组件可声明有界 `contextMenu`，宿主统一提供打开、编辑、移动、复制、尺寸和删除。便签追加导出、待办追加添加/清除完成、热搜追加刷新/订阅、世界时钟追加城市和列数。第三方菜单只能使用文本标签、已知图标和命令标识，不能注入 HTML。来源撤销、预览和窗口模式不会转发桌面指针操作。

### 验证入口

宿主：`npm test`、`tests/plugin-e2e.py`、`tests/plugin-window-e2e.py`、`tests/plugin-reuse-e2e.py`、`tests/extension-e2e.py`。跨仓库联调使用 `python tests/widget-interactions-e2e.py --widgets-root ../qiye-widgets`，可加 `--preview` 或在发布后用 `--live`；覆盖真实拖动、菜单、调整尺寸、刷新保存、3 秒提示与未拦截的知乎热榜请求。

组件库：`npm test`、`npm run check`、`tests/runtime-e2e.py`、`tests/widget-controls-e2e.py`、`tests/window-e2e.py`；包括全部 19 个组件、五种卡片尺寸、深浅色、窄窗、时区日期和配置持久化。截图保存在测试输出目录，不进入发布包。

## 无按钮长按拖动（2026-10-19）

按用户澄清，桌面卡片不显示菜单、拖动柄或编辑模式的管理按钮。组件设置、尺寸和专属命令放在右键菜单中；窗口内的设置按钮、待办勾选等功能控件继续正常工作。卡片输入区的右键也打开该组件菜单，键盘可用 Shift+F10。

参考 [dnd kit Pointer Sensor 的延迟与移动容差](https://dndkit.com/legacy/api-documentation/sensors/pointer/)、[MDN Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)、[pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event) 和 [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)。以 iTab 的简洁卡片为视觉基线，采用整张卡片 320ms 长按，无新增可视控件；长按成立前移动超过 7px 会取消候选，保留文字选择、点击和滚动。

宿主统一计时，确认后通过 `drag-state` 通知隔离 iframe 捕获指针。输入框、复选框、链接和按钮均可启动长按，激活后抑制松手点击；Escape、指针取消、页面失焦均清理状态。触摸事件只在已经激活的拖动中阻止滚动。支持 `moveBefore` 时将运行中的卡片内容移入拖动层，结束时原位归还，避免克隆 iframe 重新联网或出现空白预览；不支持时使用静态标题预览，保留 iframe 原位直到松手提交排序。

验证：`tests/drag.test.mjs` 覆盖长按门槛和文本输入；`tests/widget-long-press-e2e.py --widgets-root ../qiye-widgets` 覆盖全部 19 张卡片、深浅色、实际文本选择、输入区拖动与保存、按钮长按不误触、取消恢复、右键和真实触摸事件。另支持 `--preview`、`--live` 验证独立预览及发布页面。


## 拖动稳定性与长按手感（2026-10-20）

复现了鼠标单向匀速移动时卡片回退数像素的问题：MessagePort 中的 iframe 局部坐标产生于旧位置，宿主收到消息时 iframe 已跟随鼠标移动，叠加当前边界会造成反馈误差。组件现在附带事件发生时的屏幕坐标，宿主固定按下锚点，并在卡片未移动时用首段至少 4px 的位移校准屏幕/视口比例；之后每帧只使用最新指针位置，不再读取移动中 iframe 的边界。兼容页面缩放和高 DPI，旧协议保留。

长按统一设为 400ms，保留长按前 7px 的移动取消容差；约 0.4 秒区分点击和拖动，同时避免明显等待。桌面卡片仍没有菜单或拖动按钮。组件拖动时保持原尺寸，取消起拖的缩放弹跳；稠密网格在下一次换位前要求至少 10px 的实际指针/滚动位移，防止尺寸不同的卡片仅因布局重排就在边界往返交换。首次聚焦 iframe 时父窗口可能收到 blur，但 document.hasFocus() 仍为 true；只有真正离开页面才取消手势。

公开示例：[dnd kit 延迟与容差](https://dndkit.com/legacy/api-documentation/sensors/pointer/)。技术依据：[MDN clientX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientX)、[screenX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/screenX)、[getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)、[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[hasFocus](https://developer.mozilla.org/en-US/docs/Web/API/Document/hasFocus)。400ms 与位移容差为本项目结合可编辑卡片作出的交互选择，不是引用资料规定的标准值。

验证入口：宿主 `tests/plugin-pointer.test.mjs`、`tests/drag.test.mjs`，组件 `tests/card-interactions.test.mjs`；跨仓库 `tests/widget-drag-stability-e2e.py --widgets-root ../qiye-widgets` 对真实鼠标指针消息增加 35ms 延迟，逐帧检查单向移动无回退、终点偏差小于 1px、停留不反复换位、iframe 无重载，覆盖五种尺寸、深浅色、80% / 125% 缩放与 390px 窄屏。可用 `--preview` / `--live` 复核构建和线上版本；原有 `tests/widget-long-press-e2e.py` 覆盖 19 个组件、文本选择、保存、取消、右键及触摸。

触摸模拟器或隐私环境可能不提供屏幕坐标（例如持续为 0,0）。该次手势继续使用旧的视口坐标路径，避免卡片停在起点；单元测试覆盖此回退，浏览器测试使用原生触摸消息检查跟随与释放。35ms 延迟压力测试针对具有有效屏幕坐标的鼠标事件。

长按成立后的触摸使用 TouchEvent 的移动/结束流；浏览器为判断平移而取消 PointerEvent 时，不提前丢弃仍在进行的单指触摸。第一次活动 touchmove 阻止默认滚动，touchend / touchcancel、多指或失焦统一收尾；长按前的划动保持原生滚动。依据 [dnd kit Touch Sensor](https://dndkit.com/legacy/api-documentation/sensors/touch/)，浏览器连续触摸轨迹与释放已纳入窄屏回归。
