# 小组件宿主 API 与双仓库边界

主程序仓库 [qiye](https://github.com/Ktclat/qiye) 负责桌面、窗口、主题、浏览器权限、备份与同步、组件源管理和宿主 API。组件仓库 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 负责组件业务代码、清单、资源、测试和独立发布。主程序构建不会检出或打包组件仓库，也不通过 Git 子模块或远程脚本导入组件。

## 用户流程

新安装只带桌面与基础功能。**设置 → 组件源** 预置 `https://ktclat.github.io/qiye-widgets/index.json`，默认关闭；打开设置不读取目录、不加载预览或组件网页。用户启用源后才请求目录，从 **添加 → 小组件** 按来源筛选、切换尺寸预览并添加实例。具体组件的版本、权限和更新在对应来源的 **查看组件详情** 内。停用或移除源会卸载 iframe，保留实例和数据；重新启用后可继续使用。

源开关、目录缓存、组件本机缓存和权限授权属于当前设备，不随桌面备份或 WebDAV 自动启用。新设备导入桌面后仍需主动启用源。目录刷新不会替换已安装清单；点击“更新已添加的组件”才更新入口和版本。目录支持最多 500 个组件、512 KiB，最多订阅 20 个自定义来源，另附官方源。

## 隔离与版本

主程序 Manifest V3 的 `script-src 'self'` 保持不变。组件网页只在 `sandbox="allow-scripts allow-forms allow-downloads"` iframe 中执行，无 `allow-same-origin`、顶层导航、弹窗或原生扩展 API。主程序不 `eval`、不动态导入远程 JavaScript。使用 `MessageChannel` 为每个实例建立专用端口；不接受全局广播调用。首次加载才转交端口，组件自行导航后撤销会话。opaque origin 的初始化使用 `targetOrigin='*'`，接收对象限定为该 iframe 的 `contentWindow`。

`qiye-widget` v1 的社区计数器协议继续支持。v2 清单必须带 `apiVersion: 2`，声明 `capabilities`（目前仅 `bookmarks`、`wallpaper`、`geolocation`）。未知版本和能力被拒绝。网页入口固定为版本路径，不能通过目录刷新悄悄升级既有实例。

## v2 通信

宿主发送 `{type:'qiye:init',version:2,item:{id,title,size},value,revision,storage,environment}` 和一个 MessagePort。`value` 是序列化 JSON `{config,data}`；`revision` 是该实例原始值。旧原生记录使用 `legacy:{widget,config,data}` 传入，由组件仓库负责格式升级。环境只含语言、主题、尺寸、显示模式和列出的外观设置，不含其他实例、桌面链接、WebDAV 凭据或用户头像。

组件初始化完成回复 `{type:'ready',version:2}`。调用使用 `{type:'call',id,method,params}`，响应为 `{type:'result',id,value}` 或 `{type:'result',id,error}`。

| method | 参数与行为 |
| --- | --- |
| `save` | `{value:{config,data},expected,title?,size?}`；只修改本实例，检查旧 revision 后原子保存。旧记录首次保存时转为固定版本的社区实例。 |
| `storage` | `{value:{key:string}}`；实例专属本机缓存，不进入备份。 |
| `open` / `settings` | 打开本实例窗口 / 宿主标题与尺寸设置。 |
| `close` / `expand` | 关闭 / 最大化当前组件窗口。关闭前发 `flush`，等待 `flushed` 确认。 |
| `toast` | `{message}`；受长度限制的提示。 |
| `openUrl` | `{url}`；只允许公开 HTTPS URL。 |
| `wallpaper` | 需声明对应能力；打开宿主壁纸中心，或提交受验证图片 / 照片。 |
| `geolocation` | 需声明能力并在宿主标题栏主动授权；只提供一次粗略定位，不提供后台位置监听。 |
| `bookmarks` | 需声明能力，且用户在宿主按钮主动授予当前来源和组件访问权。仅允许列出的书签操作；无通用 Chrome API 转发。 |

宿主以 `state` 消息发送实例更新和环境变化。组件不能覆盖正在编辑的草稿；冲突必须显示给用户。宿主对未知组件也保留有界纯 JSON，以便离线、源停用和未来版本导入；业务字段校验由组件执行。单个 config/data 上限 4 MiB，备份总上限仍为 6 MiB，禁止特殊对象、原型键、过深结构和非 JSON 值。

关闭时组件未确认保存会保留窗口，并显示宿主的“强制关闭”操作。用户明确放弃未保存内容后才能跳过确认；已保存的数据仍然保留。添加其他卡片或切换主题不会重新加载现有组件的编辑会话。

浏览器权限策略只开放 `clipboard-write`，让编码工具、地图的复制按钮工作；不开放 `clipboard-read`。这不授予组件读取系统剪贴板的能力。

添加页优先显示清单中匹配尺寸的 `previews` 图片。没有图片或图片加载失败时，挂载不可交互的卡片预览：`environment.preview: true`、`mode: 'card'`、空 `storage` 与 `value: 'null'`。只启用 `allow-scripts`；不提供已安装实例的数据，拒绝全部宿主 API 调用。作者应在预览模式避免自动保存和权限请求。预览进入可视区域才加载，移出、筛选隐藏或关闭后销毁，收到 `ready` 前保留主题加载界面。

## 运行边界

首次启用和加载网页需要网络；浏览器缓存不是保证离线可用的安装包。组件内的天气、地图和汇率等请求遵循网页 CORS，不能继承主程序的跨域特权。原生浏览器书签通过单独授权的宿主桥接提供；网页版仍仅支持独立收藏。窗口、卡片、深浅主题和原有组件布局保留在独立运行包中。

## 旧组件的窗口准备与圆角覆盖（主程序 v0.10.3 起）

鼠标在已就绪的桌面卡片停留 60ms 或键盘聚焦卡片时，宿主在不可聚焦的隐藏容器中准备该实例的网页。此时没有 `qiye:init`、实例数据或 MessagePort，组件不能通过宿主读取、保存或请求权限。真正打开窗口后才发送最新状态和端口。页面保留移动使用 `Element.moveBefore()`，避免普通 DOM 插入导致 iframe 再次导航；尚未加载完成的页面也保留原请求。关闭仍先等待 `flush`，然后销毁会话，不复用旧窗口的草稿或计时器。

全桌面最多保留一个待用页面，10 秒后回收；换卡片、来源改变、实例卸载或标签页进入后台会提前回收。编辑桌面、触屏触摸、节省流量、未启用来源和不支持 `moveBefore()` 的浏览器不主动准备。准备失败或无法保留移动时，使用原来的隔离加载与重试流程。此优化减少点击后的页面加载工作，不承诺首次联网或慢速网络下无等待。

组件窗口外层使用 `overflow: hidden` 与 `scrollbar-gutter: auto`，只负责铺满、边框与圆角裁剪。组件内部负责滚动；外层不再为不可见滚动条留出 6px 的宿主底色。卡片和窗口均保留原沙箱权限。

研究来源与决策：

- [MDN：scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter)：经典滚动条模式下 `stable` 即使配合 `overflow: hidden` 也占位，因此必须在组件窗口显式设为 `auto`。
- [Chrome：Preserve state during DOM mutations with moveBefore()](https://developer.chrome.com/blog/movebefore-api) 与 [MDN 的 iframe 状态保留示例](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)：采用有界的、用户操作意图触发的页面准备；使用功能检测与失败回退，维持 Chrome 116 的最低兼容要求。
- [V8：The cost of JavaScript](https://v8.dev/blog/cost-of-javascript-2019)：缓存命中不等于没有解析与执行成本；保留已准备的文档，而不是只隐藏加载提示。视觉继续沿用用户提供的 iTab 式紧凑圆角窗口。

回归入口：`python tests/plugin-window-e2e.py` 和 `--preview`，覆盖数据延迟授予、最新状态、单实例上限、准备中打开、关闭保存、超时回收、导航撤销、来源停用、功能回退，以及深浅主题 / 窄屏 / 100–150% CSS 缩放下的边缘对齐。

## 研究依据与决策（2026-10-18）

- [Chrome：Manifest V3 Additional Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)：区分扩展上下文与不接触扩展 API 的隔离上下文，因此选择 iframe 插件边界，不把组件代码导入宿主。该架构不是商店审核通过的保证。
- [Chrome：Sandbox](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)：独立 origin 与消息通信，宿主保持严格 CSP。
- [MDN：postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)：限定目标窗口、验证消息、使用实例专用端口。
- [Microsoft Webview Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample)：参考隔离视图、消息交互、状态和销毁生命周期；视觉继续沿用项目现有 iTab 参考布局。
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)：两仓库各自构建和部署，组件使用固定版本路径保留回退能力。

验证入口：`npm test`、`python tests/plugin-e2e.py --widgets ../qiye-widgets/dist`，以及组件仓库的 `tests/runtime-e2e.py`。

表单行为依据 [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)：启用 `allow-forms` 让组件的表单校验与 submit 事件工作；仍不启用同源、顶层导航和弹窗权限。组件表单自行导航会撤销宿主端口。


## 已就绪页面的内存复用（主程序 v0.10.4 / 组件库 v1.0.3）

2026-10-18：用户截图中的“正在打开组件…”来自宿主 `mountPlugin` 的新 iframe 启动流程，并非固定等待计时器。即使 JS/CSS 命中 HTTP 缓存，每次新建窗口也要解析、初始化、建立端口、渲染并回复 ready；此前的鼠标准备仅提前加载文档，不执行带实例数据的初始化。采用已运行卡片的视图切换，可以直接省去第二次启动。

这是 API v2 的可选能力：组件在 ready 中附加 `features: ['view-switch']`。宿主仅对已就绪、同一实例、同一来源及完全相同清单的桌面卡片启用；预览、未声明能力或不支持 `Element.moveBefore()` 的浏览器保持旧路径。宿主将原 iframe 保留移动到窗口中，通过同一专用端口发送 `{type:'view',id,environment}`，其中 mode 为 window 或 card；组件等待当前视图保存、清理事件和计时绑定、重新渲染，回复 `{type:'view-ready',id,error?}`。没有第二次 `qiye:init`，不复制其他实例数据，也不增加沙箱或浏览器权限。

宿主等待匹配 id 的确认，切换超时为 5 秒；关闭会等待正在进行的切换与 flush。失败时保留恢复/强制关闭操作。正常关闭后原页面回到原卡片，重新绑定卡片交互；编码、图片和文件工具重新渲染以清空临时输入，已保存数据与番茄钟截止时间继续有效。来源撤销或页面自行导航会停止复用并关闭端口。桌面重新布局移除了原槽位时，仍保留活动编辑窗口直到保存关闭，随后销毁旧会话。

这里复用的是已经加载的本地内存，不是下载安装包。HTTP 资源缓存继续由浏览器和服务端缓存头控制。实测的 Chromium 在相同上下文刷新后仍能复用公开 JS/CSS 响应；不能把 credentialless 的存储生命周期等同于 HTTP 缓存清除。首次加载、清缓存及需要联网的天气/地图仍可能等待，不承诺跨浏览器永久离线可用。

研究与决策：
- [Chrome moveBefore 示例](https://developer.chrome.com/blog/movebefore-api)与 [MDN Element.moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)：移动 iframe 时保留文档，普通 append 会重新导航；使用功能检测回退。
- [V8 代码缓存建议](https://v8.dev/blog/code-caching-for-devs)与 [MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)：稳定版本 URL 有利于资源/编译缓存，但不能避免创建新页面及应用初始化。
- [Chrome credentialless](https://developer.chrome.com/blog/iframe-credentialless)及 [WICG 说明](https://wicg.github.io/anonymous-iframe/)：继续保留无凭据、隔离存储，不为持久缓存而放开 allow-same-origin。
- [GoogleChromeLabs quicklink](https://github.com/GoogleChromeLabs/quicklink)：参考其按意图准备、节省流量和有界资源策略；已就绪组件直接复用运行页面，无需再预取一个副本。
- [Chrome MV3 安全迁移指南](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)：远程实现仍只在隔离 iframe 内执行，不改宿主 CSP、不将远程代码写入主程序执行环境。

验证入口：`tests/plugin-reuse-e2e.py` 及 `--preview`、`tests/extension-e2e.py --reuse`；组件仓库 `tests/view-switch-e2e.py` 使用真实 HTTP 缓存并测量视图切换，同时核对刷新/新标签页的资源请求。旧组件的准备流程继续由 `tests/plugin-window-e2e.py` 覆盖。


## 可选交互与热榜协议（宿主 0.10.5）

`environment.hostFeatures` 包含 `interactions`、`commands`、`hotboard`；旧宿主可没有该字段，组件应先检测。

- `ready` 可附 `contextMenu: [{id,label,icon}]`，最多 8 项，命令 id 最多 40 字符，标签最多 60 字符。宿主转义标签，仅接受已知图标。
- 卡片可发 `{type:'interaction', action:'contextmenu'|'pointerdown'|'pointermove'|'pointerup'|'pointercancel', x, y, pointerId, pointerType, buttons}`。坐标为 frame 视口坐标；宿主按实例绑定的 frame 换算，并只在活动卡片且非预览时处理。
- 菜单命令随窗口初始化/视图切换的 `environment.command` 传入；宿主也可发送 `{type:'command',command}`（例如 API 授权后的刷新）。组件只执行自身定义的命令。
- `call('hotboard',{platform})` 仅访问 `https://uapis.cn/api/v1/misc/hotboard?type=...` 的固定平台集合，返回公开 JSON。不接收插件 URL 或自定义请求头，凭据始终省略，限制 1 MiB、12 秒、3 秒合并。预览与失效会话拒绝访问。扩展需由标题栏按钮主动申请 `https://uapis.cn/*`，不会在初始化时弹权限请求。普通 iframe 网络访问仍遵循 CORS。

研究来源和视觉决策见 [组件修复记录](WIDGETS.md)。已安装组件仍固定版本；在组件源详情检查更新并“更新已添加的组件”后才使用新清单。
