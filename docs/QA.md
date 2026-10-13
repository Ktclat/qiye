# v0.4.0 验证记录

日期：2026-10-13。本轮在 Windows 上使用真实 HTTP origin 和 localStorage，浏览器为本机 Microsoft Edge 155.0.4283.45（Playwright 1.56.0 驱动）。外部图片/API 为受控夹具或显式禁网。

## 通过的检查

| 检查 | 结果 |
| --- | --- |
| `npm test` | 278 项通过，覆盖组件 API、独立实例数据、生命周期与缩放；历史迁移用例改为旧格式/缺失字段拒绝及当前格式往返 |
| `python -m unittest discover -s tests -p release_test.py` | 3 项通过：版本/触发策略、非法版本、确定性 ZIP 与路径限制 |
| `tests/browser-e2e.py` | 108 项桌面检查通过，随后自动执行 68 项编辑器/工作区检查，全部通过 |
| `tests/widgets-e2e.py` | 30 项通过：75/100/150% 缩放，360px 深浅色窄屏，缩放恢复/持久化，组件隔离、搜索/尺寸、扩展示例与卸载重绑 |
| `scripts/package-release.py` | 成功生成 v0.4.0 扩展、源码、独立 HTML、SHA-256 文件 |
| `scripts/build-preview.py` | 成功从生产模块依赖图生成独立预览和版本模块；生成 HTML 实际启动、125% 缩放通过 |
| 分发包检查 | SHA-256 与文件匹配；扩展包内所有模块导入目标存在，未混入开发工具或测试目录 |

统一使用 schema 2 测试夹具，验证每张卡片独立内容、备份/WebDAV 摘要聚合，以及旧存储键不会被读取或迁移。历史 QA 文档仅记录当时结果，不构成当前兼容性要求。

更新两项旧 UI 预期：图库不再重复展示来源提示；窄屏使用横向分类导航。来源预览中的真实作者/链接检查继续保留。截图与 JSON 报告位于本机 `output/playwright/`；CI 输出在 `test-results/` 并上传 artifact。

## 复现

```sh
npm test
python -m unittest discover -s tests -p release_test.py
python scripts/build-preview.py
python -m pip install playwright==1.56.0
python -m playwright install chromium
python tests/browser-e2e.py --output test-results
python tests/widgets-e2e.py --output test-results/widgets
python scripts/package-release.py
```

可通过 `CHROMIUM_PATH` 指定本机 Chrome/Edge 可执行文件。`browser-e2e.py` 已包含编辑器检查，不需要再次单独运行。测试用本地服务器与临时浏览器上下文，不读取用户浏览器配置。发布 CI 在 Linux 上安装 Chromium 与所需系统依赖。

## 验收边界

上表记录本地验证；远程 Actions、Release 和网页部署结果以对应提交的 GitHub 运行记录为准，不能用本地通过代替远程状态。没有访问用户 WebDAV 服务或凭据。完整扩展安装、可选权限弹窗、真实 WebDAV 冲突与 CORS、触屏和低功耗设备性能仍需实机验收。

本轮通过的是受控网络与实际 DOM/存储行为，不代表所有图标原站、天气、图库上游均可用，也不代表全面复刻 iTab。独立组件代码与宿主处于同一权限环境，不提供第三方脚本沙箱。

历史版本的验证记录见 `QA-v032.md`、`QA-v031.md`、`QA-v030.md`；本次审阅及剩余技术债见 [REVIEW-v040.md](REVIEW-v040.md)。
