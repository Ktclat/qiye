# 小组件开发指南

栖页 v0.3.1。当前是**随扩展打包的内置组件机制**，不是下载 JavaScript 即运行的插件商店。暂不执行第三方远程脚本，也不提供动态安装任意组件的入口。贡献者通过源码与 Pull Request 集成组件；独立网站可以作为普通网址收纳。

## 分工与入口

| 入口 | 职责 |
| --- | --- |
| `src/widgets.js` 的 `widgetCatalog` | 标识、名称、说明、默认尺寸和图标 |
| `renderWidget(item, state)` | 返回组件内部 HTML，不读取网络、不写入状态 |
| `bindWidgets(container, context)` | 委托事件、保存、异步任务；返回清理函数 |
| `refreshLiveWidgets(container, state)` | 更新有变化的显示字段，避免整个桌面重建 |
| `src/core.js` 的 `WIDGETS` / `validateConfig` | 白名单与导入校验，保护备份、同步和持久状态 |
| `src/app.js` 的 `widgetConfigDialog` / 表单处理 | 配置入口和保存 |
| `src/widgets.css` | 组件样式与深浅色主题 |
| `scripts/build-preview.py` | 新增模块时登记打包顺序 |
| `src/drag.js` | 宿主负责所有桌面卡片的拖动，不要各组件自行注册拖拽 |

## 数据契约

```js
{
  id: 'unique-stable-id',
  groupId: 'home',
  type: 'widget',
  widget: 'your-widget',
  title: '组件名称',
  size: '2x2', // 或 4x2
  config: { /* 仅包含已校验的 JSON 值 */ }
}
```

`id` 创建后稳定；不能把 DOM 节点、函数、计时器、AbortController 或凭据写入 config。新类型必须同时加入 `WIDGETS` 白名单，否则导入会拒绝。配置字段在 `validateConfig()` 中明确列出并逐项验证类型、长度、范围；未知字段不要无条件透传。缺省值与旧备份迁移保持兼容，继续通过 `validateImport()` / `exportState()` 统一处理。

便签、待办、习惯和专注当前是共享桌面数据；倒数日、工作日、世界时钟等通过各卡片 config 设置。不要假定所有组件各自独立；新组件需明确选择实例数据还是共享数据，不要无意修改其他同类卡片。

## 最小渲染示例

下面是可放入 `widgets.js` 的函数示例；把 `greeting` 同步加入目录、renderers 和 core 校验后才可创建该类型。

```js
function renderGreeting(item) {
  const text = escapeHtml(item.config?.text ?? '今天也留一点空白。');
  return `<div class="greeting-content">
    <p>${text}</p>
    <button type="button" data-action="greeting-next"
      aria-label="切换短句">换一句</button>
  </div>`;
}
```

外层 `.widget-inner` / `data-widget` / `data-widget-id` 由 `renderWidget` 统一生成。用户文字一律 `escapeHtml` 或 `textContent`；URL 经过对应白名单校验再进入属性。不要内联 `onclick`，不使用 `eval`、`new Function` 或远程脚本。

新增事件放在 `bindWidgets()` 的委托处理器中，先由 `data-widget-id` 查找仍存在的当前 item。调用 `context.getState()` 获取最新状态，调用 `await context.save()` 持久化，必要时再 `context.rerender()`，错误用 `context.toast()` 呈现。不得使用过期闭包中的整个状态覆盖新修改，也不要在渲染函数中调用保存。

## 生命周期与异步数据

组件离开当前分组或桌面重绘时，宿主会执行清理函数。所有监听、计时器、订阅与请求都必须有归属，并在清理时移除或取消。共享一个宿主委托监听比每张卡片单独监听更可控。

网络请求在用户明确启用后启动，提供超时、AbortController、缓存 TTL、重试和错误状态；同一请求去重。回包后检查组件仍挂载、请求序列仍有效、用户配置未改变，再更新 DOM。不要让旧请求覆盖用户刚换的壁纸或刚选的城市。请求不夹带 WebDAV 密码、私有网址、便签或搜索历史。远端响应只当数据，不执行 HTML/JS。

壁纸可参考 `src/wallpaper-library.js` 的取消与分页实现，以及 `src/wallpapers.js` 的标准化层；图标可参考 `src/favicon-view.js` 的有限并发和实际尺寸校验。扩展权限只能由明确用户操作按需申请，不能因悬停卡片自动请求新的站点授权。

## 交互、视觉和性能

宿主直接拖动卡片：非交互表面拖拽，输入框/按钮保留本来行为；键盘聚焦卡片后 Alt + 方向键排序。不要在卡片底部另加拖动按钮，也不要使用全卡遮罩挡住组件内按钮。输入区可显式标记 `data-no-drag`。

支持 2×2、4×2 和小屏缩列，长标题省略，内容不足时给出有用的空状态。使用主题变量 `--fg`、`--muted`、`--panel`、`--panel-2`、`--accent`；彩色卡片需同步提供深色颜色，不给每张卡叠加昂贵的 backdrop-filter。默认最多使用已有宿主表面的毛玻璃。动画仅 transform / opacity，响应 `reducedEffects` 与系统减少动态效果。

后台标签页暂停不必要的刷新；已有宿主每秒调度，新增计时组件不应再创建重复的全局 interval。文本未变不写 DOM；图片懒加载；限制响应体、列表长度和图片尺寸。测试加载失败、空数据、慢网和切组后回包。

## 提交与测试

1. 增加校验、渲染、目录项、配置表单与主题样式；更新相关文档。
2. 在 `tests/*.test.mjs` 添加旧备份迁移、合法/非法输入、HTML 转义、网络授权和卸载清理测试。
3. 运行 `npm test` 与 `python3 scripts/build-preview.py`，并按 [QA](QA.md) 运行浏览器回归。
4. 测试至少两张同类组件、两种主题、两种尺寸、移动分组、拖动、删除/撤销、JSON/WebDAV 往返以及请求超时。
5. PR 写清作者、许可证、素材来源、必要权限、网络目的地和实际验收范围。不要提交私人备份或凭据。

## 许可证与独立组件

栖页整体采用 **GPL-3.0-only**。合并并随程序发布的组件应具备 GPLv3 兼容的授权，并保留原作者版权/署名；整个组合程序按 GPLv3 分发。作者仍拥有自己的版权，可在兼容条件下另行许可自己的代码。

**不设“所有第三方作品都必须开源”的额外平台规则。** 独立外部网站、远端服务或与栖页未形成同一程序的作品，使用其自身许可。是否形成组合程序取决于实际集成关系，不能仅因叫作“插件”就规避或扩大 GPL。未来若提供隔离式插件接口，应先单独设计安全和授权边界，不预先宣称当前存在该接口。参考 [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#GPLPlugins) 与 [LICENSE](../LICENSE)。

## 规则网格与组件形状（v0.3.1）

桌面一个网格单位是 `gridSize + labelSpace`，labelSpace 至少 24px，会随名称字号增加。`2x2` 占两个单位与一个间距，宽高相同；`4x2` 为横向矩形。组件填满所占网格，不像网站图标那样保留底部标签区。

组件使用独立的 20px 圆角（小屏 16px），不会受网站图标圆角 0–48px 调节影响。`.widget-inner` 是组件内容边界；在最小图标尺寸 48px、默认 74px、最大 120px 均测试布局。标题、正文、数字应考虑容器宽度，不再硬编码成只适合某一个尺寸。长内容应截断或在组件内部滚动，不能撑破网格。

网站的“叠放创建文件夹”不作用于组件。组件仍通过非交互区域实时拖拽重排，内部输入/按钮正常工作。本版仅修正现有组件尺寸、边界、留白和主题衔接，并未宣称完成每个组件的独立产品改版。
