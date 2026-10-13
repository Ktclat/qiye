# 小组件开发指南 · API v1

栖页 v0.4.0 提供随扩展打包的组件接口。新增组件只需导出定义并登记到 `src/widget-extensions.js`，目录、备份校验、配置表单和生命周期由宿主接入。模块随源码审阅和打包，不从网址下载执行脚本，也不是隔离沙箱或在线插件商店。

## 五分钟接入

仓库提供可运行示例 `src/widget-example.js`。将 `src/widget-extensions.js` 改为：

```js
import { counterWidget } from './widget-example.js';
export const widgetExtensions = [counterWidget];
```

运行 `python scripts/build-preview.py`，重新加载扩展或网页。“添加 → 小组件”中会出现计数器。添加两张计数器，分别点击“加一”；右上角菜单可编辑名称、数值、尺寸。两张卡片分别保存，刷新、JSON 备份和 WebDAV 均保留。

默认不启用示例，不增加用户桌面上的组件。开发自己的组件时把示例复制为 `src/widget-yourname.js`，采用唯一 `type` 并登记定义。新增 JS 模块使用 `import { name } from './module-name.js'`、具名函数/常量导出；预览构建器自动按依赖顺序打包，发现循环依赖或不支持的导入会报错。模块文件使用小写字母和连字符。样式加入 `src/widgets.css`，用专属类名或 `[data-widget="your-type"]` 限定范围。

## 定义契约

```js
export const example = {
  apiVersion: 1,
  type: 'your-type',
  title: '组件名称',
  description: '在目录中可搜索的用途说明',
  icon: 'note',
  size: '2x2',
  sizes: ['2x2', '4x2'],
  fields: [
    { key: 'text', label: '内容', type: 'text', default: '', maxLength: 500 },
    { key: 'count', label: '数量', type: 'number', default: 0, min: 0, max: 9999, integer: true },
    { key: 'enabled', label: '启用', type: 'checkbox', default: false },
    { key: 'mode', label: '模式', type: 'select', default: 'simple',
      options: [{ value: 'simple', label: '简洁' }, { value: 'full', label: '完整' }] },
  ],
  render({ item, config, escapeHtml }) {
    return `<p>${escapeHtml(config.text)}</p>`;
  },
  mount(context) { /* 可选：监听和异步任务；同步返回清理函数 */ },
  update(context) { /* 可选：同步更新实际发生变化的 DOM 字段 */ },
};
```

| 字段 | 约束 |
| --- | --- |
| `apiVersion` | 当前仅接受整数 `1` |
| `type` | 小写字母开头，后接小写字母、数字、连字符，最长 40 字符；不可重复或覆盖内置类型 |
| `title` / `description` | 非空文本，最长 160 字符 |
| `icon` | 已有 `src/icons.js` 名称；找不到时使用宿主回退图标 |
| `size` / `sizes` | 默认尺寸必须在支持列表中；目前支持 `2x2`、`4x2` |
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

## 当前存储结构

新增第三方模块的数据保存在卡片 `config`，示意：

```js
{
  id: 'stable-id', groupId: 'home', type: 'widget', widget: 'counter',
  title: '计数器', size: '2x2', config: { label: '今天的小进步', count: 3 }, data: {}
}
```

每张卡片必须包含 `config` 与 `data` 对象。便签的数据为 `{ notes: string }`，待办为 `{ todos: [...] }`，习惯为 `{ habits: [...] }`，专注为 `{ focus: { duration, remaining, endAt, running } }`；其他组件使用 `data: {}`。新增卡片通过 `newWidgetData(type)` 创建空内容/默认计时器；复制卡片深拷贝内容。倒数日、摘录、下班设置、世界时钟使用各自完整 config；天气共享城市设置。桌面根级不保存组件内容。

项目尚未正式推出，不维护旧版本兼容或迁移。桌面仅使用 `schemaVersion: 2`，存储键为 `qiye.state.v2`；所有导入/导出与 WebDAV 通过同一校验边界。旧格式、缺失必需字段、未知字段、未安装的组件类型或不支持的尺寸均被明确拒绝，不静默转换或丢弃内容。变更模块字段时直接更新当前定义、默认值、测试与文档。

不要把 DOM、函数、定时器、凭据或缓存写入 config/data。整份备份仍有 6 MiB 限制；内置单实例限制为便签 100000 字符、待办 500 项、习惯 100 项、每个习惯 3660 天、专注 1–180 分钟。

## 网络、样式与测试

组件是受信任源码，与扩展具有相同执行环境。接口避免要求调用者接触整份桌面状态，但不是权限隔离机制。模块顶层必须无 DOM、网络和存储副作用，因为 core 同时用于 service worker 和工具栏弹窗。

默认离线可用；网络功能需明确启用，站点权限需用户操作申请，提供超时、取消、缓存、请求去重和错误状态。远端内容仅当数据，不执行远程脚本；文字经过 `escapeHtml` / `textContent`，URL 单独按协议和来源校验。`escapeHtml` 不是 URL 校验器。保留扩展 CSP，不添加 `eval` 或内联事件。

支持主题变量 `--fg`、`--muted`、`--panel`、`--accent`，使用 `.widget-inner` 范围和内部滚动；不要撑破网格。卡片独立圆角不跟随网站图标圆角，最小网格与 `2x2` / `4x2` 均需验证。减少动态效果时停用非必要动画。

```sh
npm test
python scripts/build-preview.py
python tests/browser-e2e.py --output test-results
python tests/widgets-e2e.py --output test-results/widgets
```

测试覆盖重复注册、缺失/非法 config、旧格式拒绝、实例隔离、保存失败、卸载后回包、重绑不重复监听、刷新持久化。新模块还应验收深浅主题、两种尺寸、拖动、复制、删除/撤销、JSON/WebDAV 往返。现有完整示例及自动化测试见 `src/widget-example.js`、`tests/widget-api.test.mjs`、`tests/widgets-e2e.py`。

## 代码分工

| 模块 | 职责 |
| --- | --- |
| `widget-registry.js` | 内置目录、自定义定义注册、配置校验与 API 版本 |
| `widget-extensions.js` | 产品级扩展模块入口，所有运行上下文一致 |
| `widget-settings.js` | 声明式配置表单的生成与读取 |
| `widget-runtime.js` | mount/update/cleanup、signal 与安全保存 |
| `widget-data.js` | 内置实例数据、内容摘要、数据限额 |
| `widgets.js` | 内置组件渲染和交互 |
| `core.js` / `validation.js` | 桌面存储边界与共用基础校验 |

## 许可证与独立组件

栖页整体采用 **GPL-3.0-only**。合并并随程序发布的组件应具备 GPLv3 兼容的授权，并保留原作者版权/署名；整个组合程序按 GPLv3 分发。作者仍拥有自己的版权，可在兼容条件下另行许可自己的代码。

**不设“所有第三方作品都必须开源”的额外平台规则。** 独立外部网站、远端服务或与栖页未形成同一程序的作品，使用其自身许可。是否形成组合程序取决于实际集成关系，不能仅因叫作“插件”就规避或扩大 GPL。未来若提供隔离式插件接口，应先单独设计安全和授权边界，不预先宣称当前存在该接口。参考 [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLPlugins) 与 [LICENSE](../LICENSE)。
