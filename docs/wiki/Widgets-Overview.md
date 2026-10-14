# 组件概览与架构

[Wiki 首页](Home.md) · **简体中文** · [English](Widgets-Overview-en.md)

## 接入方式选择

| 维度 | 原生组件 API v3 | 社区组件协议 v1 |
| --- | --- | --- |
| 交付方式 | 本地 ES Module，经源码审阅后打包 | 自托管 HTTPS 网页与 JSON 清单 |
| 注册入口 | `src/widget-extensions.js` | 用户订阅清单或来源索引 |
| 桌面展示 | 每个声明尺寸均使用作者渲染器 | 静态入口，详情窗口显式运行网页 |
| 数据接口 | 声明式 `config`、`getConfig()` / `updateConfig()` | `host.data` / `host.save(value)` |
| 执行环境 | 与宿主同一可信环境；不是沙箱 | `sandbox="allow-scripts"` iframe + MessageChannel |
| 更新 | 随扩展或网页版发布 | 刷新来源后，用户选择更新已添加的清单 |

原生组件源码可访问所在执行环境，API 不是权限边界。社区接口不暴露其他桌面数据，但作者网页仍可自主联网；隔离范围见[社区组件](Community-Widgets.md)。

## 内置组件目录

注册表包含 14 类用户可选内置组件；`community` 是单独的内部类型。全部内置组件支持五种尺寸。

| 类型 | 名称 | 内容与边界 |
| --- | --- | --- |
| `wallpaper` | 在线壁纸 | 所有尺寸打开壁纸中心；图库按需联网 |
| `weather` | 天气 | 独立城市 / 单位 / 联网开关，当前天气、小时与每日预报、空气质量 |
| `calendar` | 日历 | 公历 / 农历、日程、日期与工作日工具；中国调休仅提供已核实的 2026 年数据 |
| `memo` | 备忘录 | 多条纯文本记录、搜索、置顶、排序、自动保存、删除撤销与 TXT 导出 |
| `notes` | 便签 | 桌面随手记，独立文本与颜色 |
| `todo` | 待办 | 添加、勾选、删除任务 |
| `countdown` | 倒数日 | 配置事件标题与目标日期 |
| `focus` | 专注 | 可暂停的计时器，基于结束时间恢复剩余时间 |
| `workday` | 下班倒计时 | 设置工作日、下班时间与发薪日 |
| `quote` | 每日一句 | 自定义摘录与作者，或内置短句 |
| `hotlinks` | 热搜入口 | 跳转平台热门页面，不抓取实时排名 |
| `calculator` | 计算器 | 四则运算、括号与百分比 |
| `habit` | 习惯打卡 | 每日记录与连续天数 |
| `clock` | 世界时钟 | IANA 时区、城市标签与时间比较 |

## 运行结构

```mermaid
flowchart LR
  A[原生模块] --> B[注册与配置校验]
  B --> C[桌面渲染与生命周期]
  C --> D[宿主保存队列]
  E[社区 JSON 清单] --> F[目录与静态入口]
  F --> G[用户运行 iframe]
  G -->|MessageChannel| D
  D --> H[当前 schema 校验]
  H --> I[本地存储 / JSON / WebDAV]
```

卡片和详情工作区使用同一实例的数据。内置组件的紧凑尺寸显示摘要，日历、备忘录和天气使用专用详情视图；其他日常组件由工作区模块承载。详情布局根据可用空间重新排版。

| 模块 | 职责 |
| --- | --- |
| [widget-registry.js](../../src/widget-registry.js) | 类型、API 版本、配置字段、默认值和校验 |
| [widget-extensions.js](../../src/widget-extensions.js) | 随包组件登记入口，供所有运行上下文使用 |
| [widget-sizes.js](../../src/widget-sizes.js) / [widget-catalog.js](../../src/widget-catalog.js) | 尺寸计算、目录与静态预览 |
| [widget-runtime.js](../../src/widget-runtime.js) / [widget-settings.js](../../src/widget-settings.js) | 原生生命周期与自动配置表单 |
| [widgets.js](../../src/widgets.js) / [widget-summary.js](../../src/widget-summary.js) | 卡片渲染、内置交互与紧凑摘要 |
| [widget-workspaces.js](../../src/widget-workspaces.js) / [widget-details.js](../../src/widget-details.js) | 日常工具工作区、日历与备忘录详情会话 |
| [calendar-view.js](../../src/calendar-view.js) / [memo-view.js](../../src/memo-view.js) / [weather-view.js](../../src/weather-view.js) | 专用视图 |
| [widget-data.js](../../src/widget-data.js) / [widget-drafts.js](../../src/widget-drafts.js) | 实例数据、草稿、保存失败与重试 |
| [community-format.js](../../src/community-format.js) / [community-widget.js](../../src/community-widget.js) | 社区清单、实例 JSON 与隔离运行 |
| [core.js](../../src/core.js) / [validation.js](../../src/validation.js) | 完整桌面校验、持久化与备份边界 |

## 数据模型与限额

每个组件卡片包含 `config` 和 `data`。原生扩展把声明的标量字段存入 `config`，其 `data` 为 `{}`；内置组件使用明确的数据结构，社区组件用 `data.value` 存储 JSON 字符串。复制卡片深拷贝内容，新建卡片使用新默认值。

```js
// 卡片片段；不是可直接导入的完整桌面备份。
{
  id: 'stable-id', groupId: 'home', type: 'widget', widget: 'counter',
  title: '计数器', size: '2x2', config: { label: '今天的小进步', count: 3 }, data: {}
}
```

| 数据 | 每实例限制 |
| --- | --- |
| 日历 `events` | 500 条，标题 160 字符 |
| 备忘录 `entries` | 200 条，每条标题 120 字符、正文 100000 字符 |
| 便签 `notes` | 100000 字符 |
| 待办 `todos` | 500 项，每项文本 1000 字符 |
| 习惯 `habits` | 100 项，每项最多 3660 个日期 |
| 专注 `focus` | 1–180 分钟，运行状态包含结束时间 |
| 社区 `value` | 64 KiB UTF-8 JSON 字符串 |
| 完整桌面备份 | 6 MiB；网页另受浏览器存储配额限制 |

当前桌面格式为 `schemaVersion: 5`，存储键为 `qiye.state.v5`。未知类型、缺失或未知字段、非法尺寸和旧格式都会被拒绝；校验器不会用默认值补全导入数据。不要在持久数据中放 DOM、函数、定时器、凭据或缓存。

## 日历、草稿与天气的特殊约束

日历工具使用本地民用日期。工具页工作日间隔**不含开始日、包含结束日**，同一天为 0；底层 `countWorkdays` 函数采用包含首尾的计数，工具层显式扣除开始日。法定调休与传统节日分别处理，超出已核实年份不推测调休。历法引擎离线提供，来源见[第三方声明](../THIRD_PARTY.md)。

备忘录等编辑器通过 `widget-drafts.js` 保留当前页面内的失败草稿。刷新或关闭页面会丢失未保存草稿，应先重试或导出；`Qiye-unsaved-widget.json` 不是完整桌面备份。较旧草稿不能覆盖其他标签页的新修订。

天气由 Open-Meteo 预报、地理编码和空气质量接口提供，默认禁用，不读取设备精确定位。预报时间使用城市时区，未知观测显示“—”；请求超时 10 秒、缓存有效期 30 分钟、普通失败 1 分钟后重试，主动刷新可立即重试。同坐标请求合并，内存保留最多 32 城，本机缓存最多 8 城、最多 7 天旧预报。空气质量失败不会丢弃有效预报。

城市搜索超时 8 秒，后续请求取消前次请求。天气工作区由 [weather-workspace.js](../../src/weather-workspace.js) 管理，[weather-chart.js](../../src/weather-chart.js) 计算曲线，缺失数据断线而非填零。[weather-cities.js](../../src/weather-cities.js) 另存最近 8 城，按坐标去重；只有打开列表且当前天气启用时才请求其他城市预报。城市历史与天气缓存不进入备份或 WebDAV。

[下一篇：原生组件 API →](Native-Widgets.md) · [社区组件 →](Community-Widgets.md)
