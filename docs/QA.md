# v0.8.1 验证记录

日期：2026-10-14。本轮在 Windows 使用 Playwright 1.56.0 配套的 Chromium 141.0.7390.37，覆盖页面和解压扩展。网页使用真实 HTTP origin / localStorage；扩展检查使用临时浏览器配置和实际 `chrome.storage.local`，不读取用户浏览器数据。本地使用 Node.js 26.3.0、Python 3.14.6；CI 目标为 Node.js 22、Python 3.13。

## 通过的检查

| 检查 | 结果 |
| --- | --- |
| `npm test` | 330 项：新增标签页访问 / 返回 / 关闭 / 超时 / 取消、通用图标排除、延迟缓存、PNG 边界、候选去重 / 满额 / 草稿、网页隔离访问和本地图像不被网络队列阻塞；保留 schema、日期、组件、i18n、存储、同步与拖拽测试 |
| Python 发布测试 | 3 项：版本触发策略、非法版本、确定性 ZIP 与路径限制 |
| `tests/browser-e2e.py` | 108 项桌面检查，随后执行 68 项编辑器 / 工作区检查 |
| `tests/widgets-e2e.py` | 34 项组件 API、实例隔离、窗口排版与生命周期检查 |
| `tests/daily-widgets-e2e.py` | 81 项：专用日历 / 备忘录布局、最大化及选区 / 滚动保留、日期差 / 加减 / 工作日即时计算、节日时间线及跳转、键盘标签、手机列表切换、中英两种语言 / 深浅主题、日程 XSS 转义与存储、备忘录搜索 / 置顶 / 导出 / 撤销 / 关闭提交 / 延迟写入时等待关闭、存储配额失败保留 / 重开 / 导出 / 重试、天气部分失败 / 离线缓存 / 搜索 / 单位、语言即时切换 / 默认语言、360px / 150% 详情布局 |
| `tests/daily-widgets-e2e.py --preview` | 同样 81 项在生成的独立 HTML 上验证 |
| `tests/interaction-e2e.py` / `--preview` | 各 44 项：全部 14 个组件 / 5 个尺寸、长按按钮拖动与取消、完整详情编辑、抽屉 / 窗口偏好应用时机、独立大小、目录筛选与目标分组、菜单命令 |
| `tests/presentation-e2e.py` / `--preview` | 各 43 项：14 个组件 × 五种尺寸 × 深浅主题与中英文的真实几何和控件边界，独立预览 / 循环箭头 / 添加尺寸，自适应窗口和恒定字体，全局主题开关，原生下拉菜单配色与键盘 |
| `tests/extension-e2e.py` | 7 项实际解压扩展检查：MV3 service worker 启动、模块加载、语言持久化、备忘录 chrome.storage.local 保存 / 刷新、popup 语言、manifest 本地化占位符解析 |
| `tests/tab-favicon-e2e.py` | 25 项真实扩展 / 源码网页 / 独立 HTML 检查：直接请求受限的 Cookie 图标、正常访问后读取浏览器缓存、不提前抓取中间页、跨源跳转的最终图标、关闭访问页、作废旧请求、拒绝通用图标、明确选择 / 保存 / 刷新、捕获 PNG 在网页显示、中英文说明 / 深浅主题 / 上传入口；无 Chrome API 或 favicon 服务替身 |
| 打包与构建 | 生成扩展 / 源码 / 独立 HTML / SHA-256；分发包含 `_locales`、英文文档和新模块；Pages 从同源预览生成 |

以上合计 578 项浏览器 / 扩展检查。新图标流程检查真实临时浏览器缓存和自建 HTTP 站点，不使用用户的登录状态或浏览器配置。截图检查了扩展捕获候选与网页端的中英文、深浅主题说明；保留原有窗口和组件几何检查。新增静态消息均有英文词条，自动测试检查占位符一致及用户内容不被翻译。

本轮新增图标流程检查，并保留 v0.8.0 的真实几何、独立尺寸预览、原生下拉框、自适应窗口、全局主题和第三方 1×1 交互覆盖。浏览器提供的 favicon 缓存可能已经缩放；测试不把 64 px 缓存图片当成原站高清资源。功能不增加扩展权限、不扫描全部标签页，候选只有选中并保存才写桌面。

## 复现

```sh
npm test
python -m unittest discover -s tests -p release_test.py
python scripts/build-preview.py
python -m pip install playwright==1.56.0
python -m playwright install chromium
python tests/browser-e2e.py --output test-results
python tests/widgets-e2e.py --output test-results/widgets
python tests/daily-widgets-e2e.py
python tests/daily-widgets-e2e.py --preview
python tests/interaction-e2e.py
python tests/interaction-e2e.py --preview
python tests/presentation-e2e.py
python tests/presentation-e2e.py --preview
python tests/extension-e2e.py
python tests/tab-favicon-e2e.py
python scripts/package-release.py
python scripts/build-pages.py /path/to/qiye-pages
# 部署成功后执行实际公网文件和界面校验
python scripts/verify-live.py --expected /path/to/qiye-pages
```

可用 `CHROMIUM_PATH` 指定 Chrome / Edge。CI 在 Linux 安装 Chromium 并执行同一套检查；解压扩展使用完整 Chromium 通道。安装版检查等待窗口实际关闭和目标内容出现，失败时保留测试配置的截图 / 存储快照。浏览器截图 / JSON 报告位于 `test-results/`，由 CI 上传 artifact。`verify-live.py` 读取当前 manifest 版本和生产存储键，对公网 HTML、图标和许可证与构建文件逐字节比较，并用无 API 模拟的新浏览器验证语言、组件和持久化。

## 验收边界

天气、地名、图库及图片的功能回归使用受控响应，不能视为上游在所有地区都可访问。公网验证不替代上游服务 SLA。没有访问用户 WebDAV 凭据或真实服务；可选权限弹窗、真实 WebDAV 条件写入 / CORS、触屏和低功耗硬件性能还需要对应环境实测。

没有宣称完整复刻 iTab。中国调休仅覆盖 2026 年；未实现日历循环提醒 / 系统通知、备忘录富文本 / 附件和所有地区的法定节日。语言先支持简体中文与英语。草稿失败恢复仅在当前页面内有效，刷新之前需重试保存或导出。

远程 Actions、Release 与 Pages 部署状态以对应提交的 [GitHub Actions](https://github.com/Ktclat/qiye/actions) 为准。本地通过不等于远程成功。历史结果见 [QA-v060.md](QA-v060.md)、[QA-v050.md](QA-v050.md)、[QA-v040.md](QA-v040.md)、[QA-v032.md](QA-v032.md)；审阅发现见 [REVIEW-v070.md](REVIEW-v070.md)。
