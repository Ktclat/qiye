# 社区组件与桌面分享

当前提供两条独立入口：**添加 → 社区组件** 和 **添加 → 分享与导入**。扩展、独立 HTML 与 GitHub Pages 使用同一套实现。只支持本文的当前格式，不进行历史格式兼容或数据迁移。

## 使用社区组件

1. 在“社区组件”填入公开 HTTPS 来源，点击“读取并订阅”。默认地址为 `https://ktclat.github.io/qiye/community/index.json`。
2. 查看作者、版本、源码、运行域名，选择尺寸与目标分组，再添加。桌面显示静态入口；点击或双击后进入专用运行窗口。
3. 点击“运行组件”才加载作者网页。停止或关闭窗口会移除 iframe，关闭消息通道和监听。
4. 来源保存在独立本机记录 `qiye.community.v1`，最多 20 个。不加入桌面备份或 WebDAV。来源刷新失败时保留上次成功目录。
5. 刷新来源只更新目录。点击“更新已添加的组件”才替换同一来源、同一 ID 的已安装清单，保留实例数据；不支持的新尺寸回到 2×2。其他来源不能凭同名 ID 更新已有实例。

打开社区页会向作者的预览图片地址发起请求。读取来源时不发送登录凭据或 Referer，不接受重定向；扩展按用户操作申请该来源域名权限。网页版需要服务器允许 CORS，例如 GitHub Pages 或可直接读取的 raw JSON。第三方网页仍可自主联网，因此其内容、联网行为和可用性由作者负责。没有账号上传服务、排名、自动审核或付费市场。

## 作者接入

复制仓库的 `community/examples/counter/index.html` 与 `community/sdk.js`，放到自己的静态网站。示例在隔离环境中实现计数、归零、读写自身数据和主题变化。

创建 `qiye-widget.json`：

```json
{
  "format": "qiye-widget",
  "version": 1,
  "id": "yourname.counter",
  "name": "我的计数器 / My counter",
  "description": "组件用途说明",
  "author": "Your name",
  "release": "1.0.0",
  "entry": "https://yourname.github.io/widgets/counter/index.html",
  "repository": "https://github.com/yourname/widgets",
  "license": "MIT",
  "sizes": ["1x1", "1x2", "2x1", "2x2", "4x2"],
  "previews": [
    {"size": "1x1", "url": "https://yourname.github.io/widgets/counter/1x1.png"},
    {"size": "2x2", "url": "https://yourname.github.io/widgets/counter/2x2.png"}
  ]
}
```

- `id` 为小写 `作者.组件名`，允许数字和连字符，最长 80 字符。
- `release` 为三段数字；`version: 1` 是清单及消息协议版本，与原生组件 API v3 分开。
- 必须支持 1×1、2×2，可选 1×2、2×1、4×2；选择器只显示声明尺寸。每个尺寸最多一张预览；未提供时显示明确占位。
- 所有入口、源码、图片、来源均需公开 HTTPS 域名地址，不接受账号密码、非标准端口或字面 IP。清单不能携带宿主 JS、CSS 或其他可执行字段。
- 当前桌面卡片是静态入口，完整交互运行在详情 iframe 中。iframe 收到实际宽高，作者应响应可用空间，不能假设详情窗口等于卡片像素尺寸。
- 网页需允许 iframe 嵌入：不能使用 `X-Frame-Options: DENY/SAMEORIGIN`，也不能用 `frame-ancestors` 阻止栖页。启用脚本模块、字体、接口时应正确配置 CORS；sandbox 的来源为 opaque origin，服务端可能收到 `Origin: null`。不要依赖父页面 DOM、同源 Cookie 或 iframe 内 localStorage。

用户可直接订阅该清单。若提供多个组件，可发布索引：

```js
const source = {format: 'qiye-widget-source', version: 1, name: '我的组件', widgets: [manifest]};
const json = JSON.stringify(source, null, 2); // manifest 是上面的完整清单对象
```

`widgets` 实际须为完整清单对象数组，最多 50 项；来源上限 512 KiB。宿主只读取声明数据，不执行从清单取得的 JavaScript。

### 登记到公共目录

1. 将完整清单加入 `community/widgets/作者.组件名.json`。
2. 执行 `node scripts/build-community.mjs`，生成 `community/index.json`；`npm test` 校验格式。
3. 向本仓库提交 PR，说明源码、许可、联网行为以及各尺寸预览。合并并部署 Pages 后，用户刷新公共来源即可发现组件。
4. 之后版本更新同样修改清单并提交 PR。也可维护自己的来源，用户直接订阅，不依赖公共目录收录。

公共目录只登记清单，不复制作者的项目，也不自动审查作者服务器未来返回的内容。建议 `entry` 和预览使用不可变的版本路径；即使清单版本不变，服务器仍可能改变网页，宿主无法保证远程内容不变。

## 隔离接口 v1

iframe 设置 `sandbox="allow-scripts"`，没有 `allow-same-origin`、父窗口导航、弹窗、表单或下载权限。浏览器支持时设置 `credentialless`，不发送 Referer，并拒绝摄像头、麦克风、定位及剪贴板权限。不要把它当作网络防火墙：网页可以向外部服务发请求。

父页面在 iframe load 后向该窗口传递专属 `MessageChannel`，初始化消息为：

```js
{ type: 'qiye:init', version: 1, data: '{"count":0}',
  environment: { locale: 'zh-CN', theme: 'dark', size: '2x2', width: 680, height: 520 } }
```

唯一传输端口在 `event.ports[0]`，组件校验 `event.source === parent`。握手回复 `{type:'ready', version:1}`；12 秒内无响应会卸载 iframe，显示错误与重试入口。

推荐直接使用 SDK：

```js
import { connectWidget } from './sdk.js';
const host = await connectWidget();
const value = host.data ?? { count: 0 };
await host.save({ count: value.count + 1 });
host.onEnvironment(({ theme, width, height }) => { /* 重排与主题 */ });
```

保存消息为 `{type:'save',id:'唯一请求号',value:'JSON 字符串'}`；宿主返回 `{type:'saved',id,ok:true}` 或 `{type:'saved',id,error:'…'}`。每实例最多 64 KiB UTF-8 JSON、每 100ms 最多接受一次写入、不并发写入。成功确认后才更新 UI；SDK 的保存 Promise 会在失败时 reject。不要把密码或令牌放入组件数据。

宿主仅提供本实例数据与显示环境，**不提供桌面网站列表、其他组件内容、WebDAV 凭据、任意宿主 fetch 或执行脚本接口**。数据随当前桌面备份和 WebDAV 同步；导出排布时清空。原生内置组件开发仍使用 [API v3](WIDGETS.md)，经源码审阅后随应用打包。

## 桌面排布分享 v1

“分享与导入”可导出选定分组与其中的网站、文件夹、组件尺寸和顺序，格式为 `qiye-layout` / `version: 1`，最大 2 MiB。可选携带白名单中的外观设置，不带自定义壁纸媒体、头像、搜索记录、WebDAV 配置等个人记录。

内置组件恢复默认标题和设置，所有组件内容清空；社区组件保留来源和清单用于安装，但清空实例数据。天气与社区组件不会因导入自动联网运行。网站名称、完整网址及网站图标属于主动分享的内容；发布前应在预览中检查网址是否含私人查询参数或内部地址。

下载的文件可自行放到公开仓库或网站。输入该 JSON 的直达 HTTPS 地址可生成 `https://ktclat.github.io/qiye/#import=编码后的JSON地址`；接收者打开链接时只填写预览表单，不自动请求或导入。扩展中也能粘贴此分享链接。不能公开托管时，直接发送 JSON 文件即可。

导入先校验，再预览、选择分组、选择“新建分组”或“合并到现有分组”。默认跳过桌面已有的相同网址，新建 ID 并重写文件夹关联，单次保存，不覆盖现有内容。导入后在当前页面可撤销；如果此后桌面发生其他修改，拒绝撤销以免覆盖新操作。完整个人备份仍使用设置中的备份功能，与公开排布分享分开。

## 维护与验证

- 清单、来源、实例数据：`src/community-format.js`；联网读取：`src/public-json.js`。
- 目录 UI：`src/community-ui.js`；隔离运行：`src/community-widget.js`。
- 排布协议：`src/layout-sharing.js`；导入导出：`src/sharing-ui.js`。
- `tests/sharing-community.test.mjs` 检查字段、大小限制、隐私边界、重复网址与 ID 重映射。
- `tests/workspaces-e2e.py` 与 `--preview` 检查实际导入、撤销、隔离运行及保存；线上验证另用 `scripts/verify-live.py`。

发布流程构建同源预览与 `community/` 静态资源。第三方自托管服务可能拒绝跨域、嵌入或不可用，这些情况显示错误，不降级为宿主内执行远程代码。
