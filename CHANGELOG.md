# 更新日志 / Changelog

[项目首页](README.md) · [English README](README.en.md) · [下载发行版](https://github.com/Ktclat/qiye/releases)

此文档集中维护按版本倒序排列的用户可见变化。以下历史条目从原 README 迁入，保留原版本语境；其中的 API、存储格式与验收结论不代表当前版本。未核实的发布日期不补写，实际发布状态以 GitHub Releases 为准。

This is the canonical version history, moved from the original README. Historical API and storage references describe those releases, not the current implementation. Release dates are omitted where unverified; GitHub Releases records publication status.

发布流程与下载包结构见 [发布指南](docs/RELEASES.md)，测试结果见 [验证记录](docs/QA.md)。新增版本请在本文顶部追加变更、修复与破坏性调整；README 只维护当前功能概览和文档入口。

## v0.9.2 — 图片压缩 / Image compression

- 新增本地“图片压缩”小组件：静态 PNG/JPEG/WebP 上传、最多 10 张批量处理、智能/WebP 高画质模式、真正无损 PNG 元数据清理与 DEFLATE 重压缩、滑动前后对比、逐张下载、ZIP 下载和一键设为壁纸。工作文件不保存至桌面、JSON 备份或 WebDAV。
- 自定义壁纸上传自动尝试本机高画质 WebP 压缩（PNG/JPEG/WebP 原图上限 32 MiB、24 MP，不改变分辨率）；最终仍需符合 4 MiB 存储限制。动态图片和视频保留原有上限，不会静默丢帧；压缩失败保留原有壁纸。
- Added an offline Image Compressor widget with pixel-lossless PNG optimization, high-quality WebP/JPEG, batch comparison, ZIP exports and direct wallpaper use. Wallpaper uploads use the same engine locally; image files never leave the browser or enter backups until applied. Animated formats are not re-encoded.
- 已知边界：WebP/JPEG 视觉压缩不是像素无损；真正无损模式仅支持 PNG；暂不含 AVIF 编码器、视频/动画重编码或额外 WASM。构建器与 CI 发布网页使用同一生产源码。

## 未发布 / Unreleased

- 进制转换整合进换算器，统一为 20 类工具；旧卡片无损迁移。进制页采用通栏输入、紧凑结果行、折叠设置与 46px 共用标题栏，补齐跨分类保存和失败重试验证。
- Integrated base conversion into the 20-tool Converter, preserving legacy cards and their data. Added a full-width input, compact results, contextual settings and a shared persistence queue with recovery tests.

- 热搜榜桌面标签默认只显示平台名称，详情图标改用透明底；订阅排序新增整行拖拽预览、占位、插入提示与移动动画，修复“订阅顺序已保存”提示不消失，保存失败仍保留错误信息。
- Trending cards now use text-only platform tabs and transparent detail icons. Subscription sorting adds a whole-row drag preview, placeholder, insertion marker and movement animation. Success notices dismiss automatically while save errors remain visible.

- 新增“编码工具”：Base64 / Base64 URL、三种 URL 范围、HTML 实体、Unicode、UTF-8 十六进制和 JSON 字符串编解码，以及 MD2 / MD4 / MD5 / SHA 摘要。支持实时转换、双栏编辑、复制与连续转换、中英文、深浅主题和窄屏；文本仅留在当前窗口，关闭清空。
- 编码工具新增“趣味编码”：经典佛曰、兽语 / 兽音译者、原版熊曰 / 与熊论道。标明格式版本，支持自定义兽音字表、解码自动识别字表、损坏密文提示与解压长度限制，全部在本机处理。
- 编码工具窗口改为 46px 单行标题栏，缩小图标并移除副标题，将更多空间留给输入与结果；长标题省略显示，悬停可查看完整名称。
- Added Encoding tools with reversible text encodings and one-way MD / SHA hashes, live conversion, input/output editors, copy, chained transformations and responsive layouts. Text stays in memory and clears when the workspace closes.

- 移除旧“专注计时”入口，已有卡片自动迁移为番茄钟并保留计时进度；番茄钟采用 48px 单行标题栏，专注、短休、长休可在计时盘上方直接输入并应用。
- Retired the old Focus timer with automatic progress-preserving migration to Pomodoro. Added a compact 48px header and directly editable focus, short-break and long-break durations above the dial.

- 进制转换新增 8 / 16 / 32 / 64 / 128 位有符号与无符号模式、数值 / 位模式输入、补码与范围校验；并列显示两种解释和位视图，压缩结果行并保留 44px 标题栏。
- Base converter now supports signed / unsigned 8–128-bit integers, explicit numeric / bit-pattern input, two’s-complement decoding, range errors and compact results with both interpretations and a bit view.
- 新增“进制转换”：2–36 进制多结果实时展示，支持精确大整数、负数、小数及循环节，提供精度、分组、前缀、逐项 / 全部复制和独立保存；适配五种卡片尺寸、中英文、深浅主题与窄屏。
- Added a Base converter with simultaneous outputs for bases 2–36, exact large integers and fractions, recurring notation, precision and formatting controls, copy actions, independent saved state and responsive layouts.

- 新增“番茄钟”：带叶片的刻度盘、专注与休息配色、25 / 5 / 15 节奏与长休循环、专注事项、每日目标和完成记录。支持五种尺寸、提示音、暂停续计、跨页恢复、中英文与深浅主题；仅完整专注计入成果，下一阶段手动开始。
- Added Pomodoro with a leaf-topped dial, focus/break palettes, configurable work/rest cycles, a task per round, daily goals and session records. Supports five sizes, optional chimes, pause/resume, page-close recovery and responsive bilingual themes. Only completed focus rounds count; the next phase starts manually.

- 已有“热搜入口”自动升级为热搜榜，保留位置、尺寸和自定义名称；添加面板只展示新版入口。Existing Trending links cards upgrade in place, and the widget catalog offers the new Trending widget.
- 新增“热搜榜”：点击直接查看排名、标题和热度，1260 × 840 阅读窗口；支持 22 个公开来源、分类与平台搜索、订阅管理、拖动 / 键盘排序、单榜 / 多榜视图、刷新、最大化及五种桌面尺寸。自动更新开关仅控制后台刷新。
- 默认接入 UAPI 热榜与 GitHub 新仓库榜，可配置兼容 DailyHotApi 的 HTTPS 服务。按实例保存设置，提供 10 分钟缓存、离线旧榜与失败重试，并适配中英文、深浅色和窄屏。
- Added a Trending widget with 22 public sources, categories/search, subscription ordering, single/multiple lists, refresh, maximize, five sizes, independent settings and cached offline lists. Uses UAPI and GitHub with configurable DailyHotApi-compatible services.

## v0.9.1

- 天气详情改为独立蓝灰渐变面板：当前天气、气压 / 降水 / 日出日落，以及可横向查看的 24 小时曲线、7 天高低温曲线。小时预报可切换温度、降水概率和风速。
- 右上角提供城市搜索、最近城市天气列表与设置抽屉；最多记住 8 个城市，切换同步更新当前卡片。城市列表仅存本机，不进入备份或 WebDAV。
- 保留 °C / °F、离线缓存、未知数据提示，并适配深浅色、中英文、手机及现有窗口大小选项。

## v0.9.0

- **壁纸交互**：五种尺寸直接打开壁纸中心；鼠标按住移动或长按整卡均可拖动，Esc 可取消，短按保持点击操作。
- **独立工作区**：倒数日直接编辑事件和日期，下班倒计时设置工作日与发薪日，专注选择时长并控制计时，天气整合城市 / 单位与小时 / 每日预报。便签、待办、习惯、时钟和计算器提供相应编辑、筛选、记录或比较工具。
- **社区入口**：订阅公共目录或作者自己的清单，选择尺寸、查看来源后添加；打开详情点击运行隔离网页组件。附带可运行计数器、SDK、清单校验与作者提交 PR 的流程。
- **排布分享**：选分组导出 JSON，自己托管后生成分享链接；接收者预览、新建或合并分组、过滤重复网址、撤销。分享不会带走便签、备忘录、待办等个人内容。

扩展与网页共用模块，界面支持中英文及深浅主题。社区组件当前在详情窗口运行，桌面显示静态入口；作者网页需支持嵌入，网页版 JSON 来源需允许 CORS。[社区 / 分享说明与开发接口](docs/COMMUNITY.md)。

## v0.8.2

修复搜索引擎下拉菜单与搜索建议被日历、备忘录等桌面组件遮挡的问题。滚动区域的搜索浮层位于组件上方，固定搜索栏仍位于滚动时间区域上方。覆盖时间 / 搜索独立固定、深浅主题、窄屏、编辑与极简模式；扩展和网页使用同一份样式。

## v0.8.1

编辑网站时可点击 **访问网站取图标**：正常访问网站，等浏览器标签页显示图标后返回栖页，图标便会加入候选。选中并保存后使用本地 PNG，不再依赖原站图片链接或登录 Cookie。原有图标与选择保留；没有图标时会提示重试或上传，不把浏览器通用图标当成成功结果。

复用现有 `favicon` 权限，只跟踪本次主动打开的标签页，不新增 `tabs`、历史或脚本注入权限。两分钟超时，取消、关闭编辑器或修改网址会终止等待，打开的网站由用户自行关闭。网页端提供访问 / 上传入口及能力说明；扩展中保存的本地图标可以随当前格式的备份在网页使用。[流程与接口](docs/FAVICONS.md#访问后读取标签页图标)。

## v0.8.0

- **按尺寸设计组件**：默认 1×1 为 60×60、1×2 为 60×150、2×1 为 150×60、2×2 为 150×150、4×2 为 330×150，间距 30 px；标签放在间隙，不再扩大组件。窄屏自动收紧。
- **独立预览**：每张目录卡片支持左右切换、尺寸圆点和尺寸文字；点击添加使用当前展示的尺寸。预览与桌面共用真实渲染器，不联网或修改数据。
- **自适应窗口**：75%、100%、125%、150% 只调整可用空间，内容重新排版；不再使用 CSS zoom 放大控件。设置继续支持侧边面板和居中窗口。
- **统一主题**：用一个“全局使用主题色”开关管理时间、导航、按钮和组件，修复深色原生下拉框的背景和文字。紧凑便签也遵循深浅模式。
- **组件 API v3**：第三方作者自行实现所有声明尺寸，1×1 也调用 render、mount、update；示例计数器可直接点击计数。[接口与布局指南](docs/WIDGETS.md)。

当前存储使用 schema 5，不做历史格式迁移；扩展和网页由同一份源码生成。技术审阅和实测参考见 [REVIEW-v080.md](docs/REVIEW-v080.md)。

## v0.7.0

- **整卡长按拖动**：按钮与卡片表面均可长按启动，短按照常操作；起拖、让位和落位带轻微动画，Esc 可取消。
- **紧凑网格与组件**：全体内置组件支持 1×1、1×2、2×1、2×2、4×2；小卡片显示摘要，点击打开完整功能；网站图标继续默认原始轮廓和透明背景。
- **窗口与侧栏**：日历默认 1060 × 690，设置可选择右侧面板或居中窗口，下次打开生效；“主题与材质”可独立调整窗口大小 75%–125% 与控件缩放 75%–150%。
- **添加与右键菜单**：左侧分类、右侧大卡片预览；支持用途搜索、目标分组、网站导航、自定义图标；右键菜单采用紧凑布局和轻微回弹，菜单功能保留。
- **组件 API v2**：尺寸契约、摘要入口、详情生命周期和目录模块集中维护；[开发指南](docs/WIDGETS.md) 补齐第三方组件提交与未来市场的边界。

该版实现与验证见 [REVIEW-v070.md](docs/REVIEW-v070.md)。该版存储使用 schema 4，按开发阶段约定不读取旧格式。

## v0.6.0

- **默认图标**：保留原始轮廓，不额外添加底色；仍可在设置中主动选择圆角和自适应底色。
- **日历专用界面**：默认横向宽卡片、左侧大日期与右侧迷你月历；展开后是独立的“日历 / 工具”应用，支持年 / 月选择、日期详情、农历、节气、节日、传统黄历及日程。
- **三类日期工具**：日期差、日期加减、工作日计算、按月份排列的年度节日时间线；点选节日直接回到对应日期。工作日间隔不含开始日、包含结束日，同一天为 0。
- **备忘录专用界面**：左侧搜索与记录列表、右侧无边框标题和正文，底部编辑 / 创建时间；保留搜索、排序、置顶、导出、自动保存及撤销删除。手机上可在列表与正文之间切换。
- **统一交付**：专用界面支持最大化、75%–150% 窗口缩放、中英文及深浅主题；扩展和网页使用相同的模块、数据与样式。

本轮审阅和实现说明见 [REVIEW-v060.md](docs/REVIEW-v060.md)。历法引擎随软件离线提供，许可与固定来源见 [THIRD_PARTY.md](docs/THIRD_PARTY.md)。没有新增历史版本兼容或数据迁移。

## v0.5.0

- **日历**：月份切换与今天定位、农历、每周起始日、2026 年中国法定节假日和调休、当天日程、年内天数 / ISO 周数、日期与工作日计算。
- **备忘录**：独立的多条记录，支持标题、全文搜索、置顶、排序、自动保存、删除撤销与 TXT 导出。保存失败保留草稿，支持重试和导出；轻量便签继续用于桌面随手记。
- **天气**：每张卡片独立选择城市与单位；全球城市搜索、24 小时 / 7 天预报、体感、湿度、风速、降水概率、UV、日出日落与 US AQI / PM2.5。联网需主动启用，断网保留最近预报。
- **国际化**：简体中文与 English，默认跟随浏览器。在“设置 → 打开方式 → 语言 / Language”切换；扩展、工具栏收藏页、网页端共用翻译。自己的分组、卡片名称与笔记不会被改写。[English guide](README.en.md) · [翻译开发说明](docs/I18N.md)。
- **维护性**：拆分日期、备忘录、天气请求、草稿保存和详情界面模块；组件 API 增加翻译与本地格式化工具。当前使用 schema 3，不兼容历史数据。

本轮具体对照范围与技术审阅见 [REVIEW-v050.md](docs/REVIEW-v050.md)。中国调休只提供已核实的 2026 年数据，其他年份不推测；未接入 iTab 私有服务，不宣称所有功能完全一致。

## v0.4.0

- **窗口缩放**：设置 → 主题与材质 → 选项窗口缩放，75%–150%，即时预览、保存和恢复默认。覆盖设置、添加、壁纸、编辑及工具栏收藏窗口；窄屏分类改为顶部滚动导航。
- **独立组件内容**：便签、待办、习惯、专注全部使用独立实例数据，删除顶层共享内容和迁移分支。组件目录支持搜索和添加前选尺寸。
- **开放组件 API v2**：本地打包模块通过定义接入目录、自动配置表单、校验和生命周期，提供可运行的计数器示例。[开发指南](docs/WIDGETS.md)。
- **减少冗余**：删除占位壁纸作者和图库重复提示，清理旧组件请求逻辑；图片详情保留来源与许可，桌面作者显示可在布局设置中关闭。
- **自动发布**：新版本 push 到 main，或 push 匹配的版本标签，通过测试后创建 Release，提供 Chrome/Edge ZIP、源码、独立预览及 SHA-256。[发布说明](docs/RELEASES.md)。

本轮审阅发现、修复及后续技术债见 [审阅报告](docs/REVIEW-v040.md)。

## v0.3.3

本版修复图标与拖拽的连续性，不增加新的账号、权限或外部代理。

| 调整 | 使用方法 |
| --- | --- |
| 图标来源和网址分离 | 先填写主站并获取图标，再把网址改成子站。已经获取的候选和当前选择保留，仍可选择、保存；后续获取追加去重结果，不清空旧图标 |
| 网站编辑滚动条开关 | 设置 → 布局 → 隐藏网站编辑窗口滚动条；默认关闭，同时用于添加网站表单，独立于桌面滚动条 |
| 拖动不重载全部图标 | 按稳定项目 ID 复用 DOM 和图片绑定，排序不再重建整个网格；组件输入草稿、已解码图片及加载状态保留 |

获取和点选仍只修改草稿，保存后才写入。更改网址会作废未完成的旧请求，但不会删除已经获取的候选。本次编辑最多保留 48 个去重候选，只对新候选或明确重试的失败候选请求图片。候选会显示真实尺寸，未加载成功的结果不可选择。

两段式网站编辑、紧凑双栏窗口、中性侧栏选中态、壁纸预览 / 选用、深浅色主题、滚动 / 固定头部、实时让位、拖入建文件夹与 WebDAV 保留。详情见 [图标设计](docs/FAVICONS.md) 和 [验证记录](docs/QA.md)。

### 功能范围文档补充记录

主站图标候选可用于子站打开地址；更换网址保留已有候选和选中图片，旧的未完成请求不会回写。后续获取追加去重结果，一次编辑最多 48 个。设置 → 布局提供网站编辑窗口滚动条开关，添加网站表单共同响应，默认显示。桌面按稳定 ID 复用网站和图片节点，排序不再重建全部图标；同组拖动保留组件输入草稿，跨组或文件夹移动只改变相应项目。

## v0.3.2

原生多候选、逐图实际尺寸、明确选择的卡片级保存、有界本机上传、当前 / 文字图标预览；设置 / 添加 / 壁纸共享无高标题栏的双栏框架；侧栏中性选中 / 可选主题色；壁纸单层详情预览与显式选用；浅色层次、搜索聚焦无额外外框。当前备份必须提供完整字段并通过严格校验。

## v0.3.1

以下条目从原功能范围文档归档，保留当时的描述。

拖动实时调整 DOM 顺序，其他卡片通过短时 transform 动画让位；仅松手提交，Esc 复原。稳定容器捕获指针避免节点移动丢失手势。可 Alt+方向键排序。

四个右上角按钮整体自动隐藏，移入/聚焦再显示，无围框；眼睛切换按钮只在工具区交互时出现。网站实际图标的容器无额外白底，保留图像自身像素；加载失败才显示原文字回退底色。底部一言固定，主内容可设置隐藏滚动条但仍可滚动。文件夹移出放在右键菜单。

壁纸双栏弹窗和数据源边界见 [WALLPAPERS.md](docs/WALLPAPERS.md)，GPLv3 与开发说明见 [WIDGETS.md](docs/WIDGETS.md)。官方背景仍是栖页六款内置渐变，不是下载来的 iTab 图库。

### 补充边界

图标的原始纵横比通过 contain 保留，统一的是外框，不把圆形品牌本身拉成方形。不人为生成不存在的高清像素。ICO 多帧选择仅在网络允许读取时进行，失败保留现有图像。详见 [FAVICONS](docs/FAVICONS.md)。

添加窗口采用左导航、右内容。分组选中块是正方形。组件网格单位与名称预留分离，组件圆角独立于图标，默认 20px，小屏 16px。两个顶层网站中央停留约 500ms 可合并成文件夹；现有文件夹中央仍收纳，组件不进入网站文件夹。

壁纸只保留能加载图片的来源，不再提供“更多灵感”及 Unsplash/Pexels 仅外链栏目。Deepin 固定官方开放目录版本；Wallhaven 为 2026-10-12 的 SFW 清单快照，原图直连，非实时榜单，不提供无条件商用授权。
