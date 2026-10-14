# 小组件开发指南 · API v3

本文介绍随扩展打包的原生组件 API v3。新增组件导出定义并登记到 `src/widget-extensions.js`，目录、备份校验、配置表单和生命周期由宿主接入。模块随源码审阅和打包，不从网址下载执行宿主脚本。

v0.9.0 增加可订阅的社区目录与隔离网页组件 API v1。第三方作者自托管网页、提交清单即可被发现；无需修改原生注册表。清单、尺寸预览、数据接口、来源登记和桌面分享见 [社区开发指南](COMMUNITY.md)。两种接口相互独立，均不兼容历史格式。

## 内置组件的卡片与工作区

`src/widgets.js` 负责尺寸化卡片与共用操作。`src/widget-workspaces.js` 为倒数日、下班倒计时、专注、便签、待办、习惯、世界时钟、摘录、热搜和计算器提供独立工作区；天气在 `src/widget-details.js` 中组合城市设置、实时状况与预报。日历、备忘录继续使用专用应用布局。不要把卡片整体放大作为详情实现。

工作区使用同一份实例数据，设置提交先校验并检查冲突，异步失败保留表单。关闭时清除定时器、事件与请求，便签按现有草稿机制提交。壁纸所有尺寸都进入壁纸中心；按钮短按执行操作，长按或鼠标按住移动拖动整卡，文本编辑区和触摸滚动保持各自操作。

## 五分钟接入

仓库提供可运行示例 `src/widget-example.js`。将 `src/widget-extensions.js` 改为：

```js
import { counterWidget } from './widget-example.js';
export const widgetExtensions = [counterWidget];
```

运行 `python scripts/build-preview.py`，重新加载扩展或网页。“添加 → 小组件”中会出现计数器。添加两张计数器，分别点击“加一”；右上角菜单可编辑名称、数值、尺寸。两张卡片分别保存，刷新、JSON 备份和 WebDAV 均保留。

默认不启用示例，不增加用户桌面上的组件。开发自己的组件时把示例复制为 `src/widget-yourname.js`，采用唯一 `type` 并登记定义。新增 JS 模块使用 `import { name } from './module-name.js'`、具名函数/常量导出；预览构建器自动按依赖顺序打包，发现循环依赖或不支持的导入会报错。模块文件使用小写字母、数字和连字符。样式加入 `src/widgets.css`，用专属类名或 `[data-widget="your-type"]` 限定范围。

## 定义契约

```js
export const example = {
  apiVersion: 3,
  type: 'your-type',
  title: '组件名称',
  description: '在目录中可搜索的用途说明',
  icon: 'note',
  size: '2x2',
  sizes: ['1x1', '2x2', '4x2'],
  fields: [
    { key: 'text', label: '内容', type: 'text', default: '', maxLength: 500 },
    { key: 'count', label: '数量', type: 'number', default: 0, min: 0, max: 9999, integer: true },
    { key: 'enabled', label: '启用', type: 'checkbox', default: false },
    { key: 'mode', label: '模式', type: 'select', default: 'simple',
      options: [{ value: 'simple', label: '简洁' }, { value: 'full', label: '完整' }] },
  ],
  render({ item, config, escapeHtml, t, locale, size }) {
    return `<p>${escapeHtml(config.text)}</p>`;
  },
  mount(context) { /* 可选：监听和异步任务；同步返回清理函数 */ },
  update(context) { /* 可选：同步更新实际发生变化的 DOM 字段 */ },
};
```

| 字段 | 约束 |
| --- | --- |
| `apiVersion` | 当前仅接受整数 `3` |
| `type` | 小写字母开头，后接小写字母、数字、连字符，最长 40 字符；不可重复或覆盖内置类型 |
| `title` / `description` | 非空文本，最长 160 字符 |
| `icon` | 已有 `src/icons.js` 名称；找不到时使用宿主回退图标 |
| `size` / `sizes` | 必须包含 `1x1` 和 `2x2`；另外可声明 `1x2`、`2x1`、`4x2`；默认 `2x2`，`size` 必须在列表内，重复尺寸会被拒绝 |
| `fields` | 配置字段唯一、显式声明；每个字段必须提供合法 `default` |
| `render` | 必需，同步返回 HTML 字符串；不发请求、不保存、不绑定事件 |
| `mount` | 可选，同步返回清理函数或 `undefined`；异步任务可在函数内部启动 |
| `update` | 可选，同步更新显示；宿主每秒在前台调度，保存配置后也调用 |

`text` 可指定 `maxLength`（默认 1000、上限 100000）和 `required`；`number` 可指定 `min`、`max`、`integer`，默认范围 ±1000000；`select` 提供 1–40 个唯一字符串选项；`checkbox` 接受布尔值。`hidden: true` 的字段仍需校验及默认值，但不展示在配置表单中，适合只由组件按钮修改的值。

未知配置字段、非法类型、范围、重复 ID 和不支持的 API 版本会报错。默认值仅在新建组件时由 `newWidgetConfig(type)` / registry 的 `newConfig(type)` 生成；校验器不会补齐导入配置中的缺失字段。当前扩展字段支持标量；复杂列表可先讨论明确的数据结构与容量限制，不无条件透传任意 JSON。

## 运行时 context

| 接口 | 行为 |
| --- | --- |
| `root` | 当前实例的 `.widget-inner` 根节点 |
| `t(message, values)` | 当前语言的界面翻译与占位符替换，见 [I18N.md](I18N.md) |
| `locale` | 此次挂载的 `zh-CN` / `en`；语言改变后宿主重新渲染 / 挂载 |
| `formatDate(value, options)` / `formatNumber(value, options)` | 当前语言的 Intl 格式化 |
| `size` | 当前呈现尺寸；紧凑卡片打开详情时为 `2x2`，不修改桌面保存的尺寸 |
| `openSettings()` / `openDetail()` | 请求宿主打开当前实例的设置 / 完整交互窗口 |
| `signal` | 卸载时中止的 `AbortSignal`；可用于事件监听和 `fetch` |
| `getConfig()` | 当前实例配置的深拷贝；每次操作读取最新值 |
| `await updateConfig(patch)` | 合并并校验当前实例配置，通过宿主保存队列写入；成功后更新显示；失败抛错；卸载/移除后返回 `false` |
| `toast(text)` | 实例仍有效时显示简短反馈 |

`render` 的 `item` 与 `config` 也是副本。宿主自动生成外层标识、标题和设置按钮。事件中使用 `event.stopPropagation()`，输入和按钮使用原生元素。不要使用 `widget-` 前缀的 `data-action`，该前缀由内置宿主事件保留。

```js
mount({ root, signal, getConfig, updateConfig, toast }) {
  const button = root.querySelector('[data-increment]');
  button.addEventListener('click', async event => {
    event.stopPropagation();
    button.disabled = true;
    try { await updateConfig({ count: Math.min(9999, getConfig().count + 1) }); }
    catch (error) { if (!error.notified) toast(error.message); }
    finally { if (!signal.aborted) button.disabled = false; }
  }, { signal });
}
```

宿主负责拖动、分组、移动、删除/撤销、尺寸、主题和持久化。不要另外创建拖动手柄。切组、替换节点或重绑时中止 signal 并调用清理函数；异步返回后仍须检查 `signal.aborted`，避免更新卸载的 DOM。自行创建的定时器、观察器、订阅在清理函数中释放。纯排序通常复用节点，组件不得依赖重新 mount 来刷新数据。

单个组件 render、mount、update 失败不会阻止其他卡片显示；update 失败后本次挂载停止刷新并提示一次。不要返回 Promise 作为 render、mount 或 update 的返回值。异步事件中的异常应由组件捕获；保存层已通知的错误带 `notified`，无需重复提示。

## 尺寸、展开与拖拽

`src/widget-sizes.js` 是尺寸契约的唯一来源。`gridMetrics(settings, viewportWidth)` 和 `widgetDimensions(size, metrics)` 同时用于桌面与预览。默认单元 60 px，间距 30 px，图标名称放在间隙中，不改变组件尺寸：

| size | 宽 × 高（CSS px） | 内置布局 |
| --- | --- | --- |
| 1x1 | 60 × 60 | 关键数字、图标或入口 |
| 1x2 | 60 × 150 | 纵向摘要、说明、次要信息 |
| 2x1 | 150 × 60 | 数字与说明左右分栏 |
| 2x2 | 150 × 150 | 紧凑完整界面 |
| 4x2 | 330 × 150 | 额外日期卡、分栏列表或并列指标 |

默认桌面宽度 ≥1350 px 时使用原始尺寸；较窄视口按宽度/1350 收紧，最小比例 80%，保证单元不小于 48 px。图标大小、间距仍可设置；名称字号不影响组件尺寸。可用列数不足时限制横向跨度，因此仍需响应容器宽度。

所有组件必须支持 `1x1`、`2x2`。API v3 在每个声明尺寸都调用扩展 `render({ size })`、`mount`、`update`，宿主不再替换为通用图标。请为窄尺寸明确选择信息层级，避免隐藏完整表单或强行缩放；可参照计数器的 1×1 直接交互按钮。根元素带 `data-display-size`，仅大尺寸由宿主添加标题栏。其他尺寸可选，目录只提供声明过的尺寸。

内置小卡片由 `widget-summary.js` 管理摘要布局，动态数据由 `widgets.js` 更新；宽版布局在 `widget-compact.css` 中按 `data-display-size` 排版。第三方也可在适当控件调用 `openDetail()` / `openSettings()`；详情以 2×2 渲染，关闭时清理生命周期，数据仍属于同一实例，不要将详情呈现尺寸写回配置。桌面卡片聚焦后 Enter 展开；原生输入、按钮和链接保持自身行为。

按住卡片任意普通表面或按钮约 320 ms 即开始拖动；短按按钮照常操作。不需要拖动手柄。已聚焦的输入框、文本域、可编辑内容和原生下拉框保留文字选择/编辑；触屏提前移动则按滚动处理。拖动中按 Esc 或取消指针，恢复原顺序且不误触按钮；释放只提交一次。键盘聚焦卡片后 Enter 展开，Alt + 方向键调整顺序。不要拦截宿主的捕获阶段指针事件。

添加目录会调用 `render` 生成 **inert 静态预览**，不会 `mount` 或联网；实现不得在 render 中产生副作用。目录按实际名称/用途搜索，支持分类与目标分组。每张卡片独立提供左右箭头、aria-pressed 尺寸圆点、当前尺寸文字；添加时采用当前预览尺寸。静态预览只在卡片空间不足时等比缩小，不改变生产渲染器的宽高与布局。没有虚构安装数或热度排名。

## 当前存储结构

新增第三方模块的数据保存在卡片 `config`，示意：

```js
{
  id: 'stable-id', groupId: 'home', type: 'widget', widget: 'counter',
  title: '计数器', size: '2x2', config: { label: '今天的小进步', count: 3 }, data: {}
}
```

每张卡片必须包含 `config` 与 `data` 对象。日历为 `{ events: [{ id, date, title }] }`，备忘录为 `{ entries: [{ id, title, text, pinned, createdAt, updatedAt }] }`。便签的数据为 `{ notes: string }`，待办为 `{ todos: [...] }`，习惯为 `{ habits: [...] }`，专注为 `{ focus: { duration, remaining, endAt, running } }`；其他组件使用 `data: {}`。新增卡片通过 `newWidgetData(type)` 创建空内容/默认计时器；复制卡片深拷贝内容。倒数日、摘录、下班设置、世界时钟使用各自完整 config；天气使用独立的 `{ city: { name, latitude, longitude }, enabled, unit }`，`unit` 为 `celsius` / `fahrenheit`；日历 config 为 `{ weekStart: 0 | 1, showLunar: boolean, holidays: "none" | "CN" }`。桌面根级不保存组件内容。

项目尚未正式推出，不维护旧版本兼容或迁移。桌面仅使用 `schemaVersion: 5`，存储键为 `qiye.state.v5`；所有导入/导出与 WebDAV 通过同一校验边界。旧格式、缺失必需字段、未知字段、未安装的组件类型或不支持的尺寸均被明确拒绝，不静默转换或丢弃内容。变更模块字段时直接更新当前定义、默认值、测试与文档。

不要把 DOM、函数、定时器、凭据或缓存写入 config/data。整份备份仍有 6 MiB 限制；内置单实例限制为日历 500 条日程（标题 160 字符）；备忘录 200 条（每条标题 120 字符、正文 100000 字符）；便签 100000 字符、待办 500 项、习惯 100 项、每个习惯 3660 天、专注 1–180 分钟。

## 网络、样式与测试

组件是受信任源码，与扩展具有相同执行环境。接口避免要求调用者接触整份桌面状态，但不是权限隔离机制。模块顶层必须无 DOM、网络和存储副作用，因为 core 同时用于 service worker 和工具栏弹窗。

默认离线可用；网络功能需明确启用，站点权限需用户操作申请，提供超时、取消、缓存、请求去重和错误状态。远端内容仅当数据，不执行远程脚本；文字经过 `escapeHtml` / `textContent`，URL 单独按协议和来源校验。`escapeHtml` 不是 URL 校验器。保留扩展 CSP，不添加 `eval` 或内联事件。

支持主题变量 `--fg`、`--muted`、`--panel`、`--accent`，使用 `.widget-inner` 范围和内部滚动；不要撑破网格。卡片独立圆角不跟随网站图标圆角，最小网格与所有声明尺寸均需验证。减少动态效果时停用非必要动画。

```sh
npm test
python scripts/build-preview.py
python tests/browser-e2e.py --output test-results
python tests/widgets-e2e.py --output test-results/widgets
python tests/daily-widgets-e2e.py
python tests/daily-widgets-e2e.py --preview
```

测试覆盖重复注册、缺失/非法 config、旧格式拒绝、实例隔离、保存失败、卸载后回包、重绑不重复监听、刷新持久化。新模块还应验收深浅主题、声明的每种尺寸、拖动、复制、删除/撤销、JSON/WebDAV 往返。现有完整示例及自动化测试见 `src/widget-example.js`、`tests/widget-api.test.mjs`、`tests/widgets-e2e.py`。

## 代码分工

| 模块 | 职责 |
| --- | --- |
| `widget-registry.js` | 内置目录、自定义定义注册、配置校验与 API 版本 |
| `widget-extensions.js` | 产品级扩展模块入口，所有运行上下文一致 |
| `widget-settings.js` | 声明式配置表单的生成与读取 |
| `widget-runtime.js` | mount/update/cleanup、signal 与安全保存 |
| `widget-data.js` | 内置实例数据、内容摘要、数据限额 |
| `widgets.js` | 内置卡片渲染和交互 |
| `calendar.js` / `memos.js` / `weather.js` | 不依赖 DOM 的日期 / 调休、备忘录集合、网络服务与缓存 |
| `widget-detail-views.js` / `widget-details.css` | 详情 HTML、转义与自适应样式 |
| `widget-details.js` / `widget-drafts.js` | 详情生命周期、事件、独立草稿、串行保存与重试 |
| `i18n.js` / `messages-en.js` | 共享翻译目录、Intl 格式化与新默认内容翻译 |
| `core.js` / `validation.js` | 桌面存储边界与共用基础校验 |

## 日常组件功能与数据来源

| 组件 | 操作 | 数据与边界 |
| --- | --- | --- |
| 日历 | 专用日历 / 工具页、年与月选择、今天、农历与黄历、节日时间线、周起始日、日程、日期差 / 加减 / 工作日 | 1900–2200 年公历，使用本地民用日期计算，避免 DST 改变天数；农历日期使用 Intl，节气 / 传统节日 / 黄历来自内置的 lunar-javascript 1.7.7；中国法定节假日 / 调休仅覆盖 2026 年 |
| 备忘录 | 专用左右布局、编辑 / 创建时间、多条记录、全文搜索、置顶、排序、TXT 导出、删除撤销、最大化及手机列表切换 | 纯文本；350ms 自动保存，关闭按钮 / Escape 等待提交结束再关闭；保存时不替换较新的草稿；失败可重试 / 导出，关闭后重新打开仍保留当前页面内的草稿 |
| 天气 | 搜索城市 / 常用城市 / 手工坐标、独立 °C / °F、当前天气、体感、湿度、风速、24 小时 / 7 天、降水、日出 / 日落、UV、US AQI / PM2.5 | Open-Meteo 预报、Geocoding 与 Air Quality / CAMS；预报时间用城市时区；未知观测显示 —；默认禁用，不读取精确定位 |

日历调休依据 [国务院办公厅 2026 年节假日安排（政府转载）](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)。工具页的工作日间隔不含开始日期、包含结束日期（同一天为 0）；选择“仅周末”按周一至周五，选择中国大陆时叠加官方调休，超出已核实年份明确报错。每年更新日期表与回归用例，不猜测下一年的法定安排。

天气请求文档：[Forecast](https://open-meteo.com/en/docs)、[Geocoding](https://open-meteo.com/en/docs/geocoding-api)、[Air Quality](https://open-meteo.com/en/docs/air-quality-api)。10 秒超时，同坐标合并请求，30 分钟有效期，普通失败 1 分钟后再试，主动刷新可立即重试。内存最多 32 个城市，本机缓存最近 8 个城市，最多保留 7 天旧预报并标明缓存 / 错误；空气质量失败不会丢掉有效预报。城市搜索 8 秒超时，后一次请求取消前一次，关闭设置会取消请求，Enter 搜索不误提交表单。缓存不进入 JSON 备份或 WebDAV。

未保存草稿是当前页面内的临时记录，刷新 / 关闭浏览器会失去草稿；出现保存失败时先重试或导出。导出的 `Qiye-unsaved-widget.json` 是组件草稿文件，不是可直接导入的完整桌面备份；单条备忘录也可使用 TXT 导出。其他标签页修改同一组件后，旧草稿不能覆盖新内容；导出后重新加载最新桌面。

对照来源是 [iTab 公开界面](https://go.itab.link/) 与 [官方更新记录](https://www.itab.link/changelog.html)。本版补齐上述可核实的日常操作，独立实现，不读取 iTab 私有接口。不包含循环日程、系统通知、富文本 / 图片附件、全国全部节日 / 节气、全球法定假日或 iTab 云端账号同步；不能把已列功能理解为整个 iTab 的完整复刻。

## 许可证与独立组件

栖页整体采用 **GPL-3.0-only**。合并并随程序发布的组件应具备 GPLv3 兼容的授权，并保留原作者版权/署名；整个组合程序按 GPLv3 分发。作者仍拥有自己的版权，可在兼容条件下另行许可自己的代码。

**不设“所有第三方作品都必须开源”的额外平台规则。** 独立外部网站、远端服务或与栖页未形成同一程序的作品，使用其自身许可。是否形成组合程序取决于实际集成关系，不能仅因叫作“插件”就规避或扩大 GPL。未来若提供隔离式插件接口，应先单独设计安全和授权边界，不预先宣称当前存在该接口。参考 [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLPlugins) 与 [LICENSE](../LICENSE)。

## 日历与备忘录专用视图（v0.6）

- `calendar-view.js` / `calendar.css`：卡片月历、独立应用标题栏、月视图、日期详情、工具与节日时间线。
- `calendar-controls.js`：临时视图状态、月份 / 工具切换、即时计算及键盘操作；不直接写持久化数据。
- `calendar-almanac.js`：将第三方历法引擎封装为不可变普通对象；按语言缓存日期及年度节日，限制缓存数量。新增翻译保留在本项目词典中。
- `memo-view.js` / `memo.css`：左侧记录导航、右侧纯文本编辑及手机列表切换。内容仍由 `widget-drafts.js` 保存，重绘工具栏不替换编辑中的数据模型。
- `widget-app-controls.js` / `widget-apps.css`：仅复用最大化、关闭等基础按钮和颜色变量。两种应用各自构建布局，不调用通用 `dialogHeader` 或通用详情表单样式。
- `lunar-engine.js`：固定上游源码及 MIT 完整许可；只替换 UMD 外壳，不从 CDN 加载。更新方法与哈希见第三方文档。

日历默认尺寸为 `4x2`、周日开头；`2x2` 和周一开头仍是当前可选设置。法定调休与民俗节日分开：节日名称本身不会被当作放假或工作日依据。黄历为传统文化资料，不作为现实事务决策依据。普通 `countWorkdays` 模型函数仍提供包含首尾的计数，工具页显式扣除开始日，计算口径不隐式改变。


## 为组件市场准备的提交契约

当前采用源码审阅并随扩展打包。市场索引和在线安装尚未上线。作者可通过 PR 提交独立模块、样式、默认配置、翻译和测试，无需改动核心存储分支；参考 `widget-example.js`。

未来市场条目应包含：稳定 `type`、组件版本、宿主 `apiVersion`、中英文名称与说明、作者、源码仓库、许可证及声明、分类、支持尺寸、配置字段说明、预览截图、所需网络域名与数据用途。打包来源需固定到可审阅的 commit / 文件摘要，更新时说明配置变更；不支持旧 API 或旧格式的条目应明确拒绝。当前这些条目信息属于提交材料，尚无可被运行时读取的市场 manifest。

验收顺序：离线首次渲染 → 两个实例独立操作 → 每种尺寸 / 详情 / 设置 → 长按、短按、触屏滚动与键盘 → 中英文与深浅主题 → 75%–150% 窗口缩放 → 保存失败 / 关闭清理 → 备份及 WebDAV 当前格式往返 → 扩展和单文件网页同源构建。截图不可代替可复现的运行测试。

后续若开放非随包组件，需先设计隔离运行环境、能力授权、安装/卸载与更新验证；当前接口里的 `root` 和源码权限不构成沙箱，不能直接拿来执行任意远端脚本。市场可以先承担发现和源码分发，扩展商店的安装能力另行设计。

## 主题和窗口

使用 `--w-bg`、`--w-fg`、`--w-muted`、`--w-accent`、`--w-accent-ink` 等语义变量；不要给文字、输入框或原生 option 写死白色背景。全局 `settings.useThemeColor` 开启时，宿主将主题色和自动选择的深/浅按钮文字应用到组件。关闭后保留组件默认配色。警告、节日周末和品牌图形保留语义颜色。

窗口由 `window-layout.js` 计算 75 / 100 / 125 / 150% 的可用空间，无 CSS zoom。第三方内容要根据容器宽度换行或分栏，不能假设“125%”意味着字体变成 125%。`theme.js` 统一主页面与工具栏收藏页的系统主题和主题色选择。

增加尺寸后运行 `tests/presentation-e2e.py` 及其 `--preview` 模式，覆盖中英文、深浅主题、五种尺寸、独立预览选择、窗口尺寸和下拉框；生命周期另由 `tests/widgets-e2e.py` 验证。

## 天气详情面板（v0.9.1）

天气使用独立 `weather-view.js` / `weather-workspace.js` 与样式，脱离通用组件设置布局。`weather-chart.js` 只负责曲线几何与标签，高低温共用比例，缺失观测断线显示 —，不填零。小时预报保留当前未结束的小时，支持温度 / 降水概率 / 风速；气压与降水量、小时风速、每日最高风速均来自 Open-Meteo 字段。

右上角城市搜索立即应用所选城市并启用天气；设置抽屉保留卡片名、手动坐标、单位与联网开关。`weather-cities.js` 在本机 `qiye.weather.cities.v1` 记录最近 8 个城市，按坐标去重。列表打开后才请求其他城市的预报；当前卡片未启用天气时不加载列表预报。切换城市保存到卡片，城市列表本身不进入备份 / WebDAV / 排布分享。关闭窗口取消搜索和事件监听；迟到的预报只更新共享缓存。
