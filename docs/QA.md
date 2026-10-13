# v0.5.0 验证记录

日期：2026-10-13。本轮在 Windows 使用 Microsoft Edge 155.0.4283.45，由 Playwright 1.56.0 驱动。网页使用真实 HTTP origin / localStorage；扩展检查使用临时浏览器配置和实际 `chrome.storage.local`，不读取用户浏览器数据。本地使用 Node.js 26.3.0、Python 3.14.6；CI 目标为 Node.js 22、Python 3.13。

## 通过的检查

| 检查 | 结果 |
| --- | --- |
| `npm test` | 295 项：当前 schema、日期 / 闰年 / ISO 周 / 调休、备忘录、天气解析 / 缓存、i18n / 占位符、草稿并发 / 保存失败 / 同组件冲突，以及原有存储、同步、拖拽与图标行为 |
| Python 发布测试 | 3 项：版本触发策略、非法版本、确定性 ZIP 与路径限制 |
| `tests/browser-e2e.py` | 108 项桌面检查，随后执行 68 项编辑器 / 工作区检查 |
| `tests/widgets-e2e.py` | 30 项组件 API、实例隔离、缩放与生命周期检查 |
| `tests/daily-widgets-e2e.py` | 53 项：中英两种语言 / 深浅主题、日程 XSS 转义与存储、备忘录搜索 / 置顶 / 导出 / 撤销 / 关闭提交、存储配额失败保留 / 重开 / 导出 / 重试、天气部分失败 / 离线缓存 / 搜索 / 单位、语言即时切换 / 默认语言、360px / 150% 详情布局 |
| `tests/daily-widgets-e2e.py --preview` | 同样 53 项在生成的独立 HTML 上验证 |
| `tests/extension-e2e.py` | 7 项实际解压扩展检查：MV3 service worker 启动、模块加载、语言持久化、备忘录 chrome.storage.local 保存 / 刷新、popup 语言、manifest 本地化占位符解析 |
| 打包与构建 | 生成扩展 / 源码 / 独立 HTML / SHA-256；分发包含 `_locales`、英文文档和新模块；Pages 从同源预览生成 |

以上合计 319 项浏览器 / 扩展检查。英文设置各分类额外检查中文残留：只保留语言自称“简体中文”和原站图标文字。详情页截图人工检查了深浅主题、长文本、窄屏、24 小时横向滚动与 7 天列表。源代码中每个静态 `t` 中文消息键都有英文词条；自动测试检查全部占位符一致及用户内容不被翻译。

历史桌面拖拽测试改从日历标题区拖动；日期格现在是可点击按钮，按钮交互本就不应触发卡片拖动。目录预期从 13 个改为 14 个。测试夹具均为 schema 3；历史 QA 仅记录当时结果，不代表兼容承诺。

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
python tests/extension-e2e.py
python scripts/package-release.py
python scripts/build-pages.py /path/to/qiye-pages
# 部署成功后执行实际公网文件和界面校验
python scripts/verify-live.py --expected /path/to/qiye-pages
```

可用 `CHROMIUM_PATH` 指定 Chrome / Edge。CI 在 Linux 安装 Chromium 并执行同一套检查。浏览器截图 / JSON 报告位于 `test-results/`，由 CI 上传 artifact。`verify-live.py` 读取当前 manifest 版本和生产存储键，对公网 HTML、图标和许可证与构建文件逐字节比较，并用无 API 模拟的新浏览器验证语言、组件和持久化。

## 验收边界

天气、地名、图库及图片的功能回归使用受控响应，不能视为上游在所有地区都可访问。公网验证不替代上游服务 SLA。没有访问用户 WebDAV 凭据或真实服务；可选权限弹窗、真实 WebDAV 条件写入 / CORS、触屏和低功耗硬件性能还需要对应环境实测。

没有宣称完整复刻 iTab。中国调休仅覆盖 2026 年；未实现日历循环提醒 / 系统通知、备忘录富文本 / 附件和所有地区的法定节日。语言先支持简体中文与英语。草稿失败恢复仅在当前页面内有效，刷新之前需重试保存或导出。

远程 Actions、Release 与 Pages 部署状态以对应提交的 [GitHub Actions](https://github.com/Ktclat/qiye/actions) 为准。本地通过不等于远程成功。历史结果见 [QA-v040.md](QA-v040.md)、[QA-v032.md](QA-v032.md)；审阅发现见 [REVIEW-v050.md](REVIEW-v050.md)。
