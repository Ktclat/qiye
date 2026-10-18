#!/usr/bin/env python3
"""Build static files for the qiye GitHub Actions Pages deployment."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='Separate publishing directory outside the source repository')
output = parser.parse_args().output.resolve()
if output == root or root in output.parents:
    parser.error('Use a separate publishing directory outside the source repository.')

subprocess.run([sys.executable, str(root / 'scripts/build-preview.py')], check=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
html = (root / 'Qiye-preview.html').read_text(encoding='utf-8')
html = html.replace('<title>栖页 Qiye · 交互预览</title>', '<title>栖页 · 新标签页</title>')
output.mkdir(parents=True, exist_ok=True)
(output / 'index.html').write_text(html, encoding='utf-8')
shutil.copytree(root / 'icons', output / 'icons', dirs_exist_ok=True)
(output / '.nojekyll').write_text('', encoding='utf-8')
shutil.copyfile(root / 'LICENSE', output / 'LICENSE')
(output / 'README.md').write_text(f'''# 栖页 Qiye · GitHub Pages

栖页 v{version} 的公开网页演示。无需注册或登录，个人桌面保存在各自浏览器中，可通过自己的 WebDAV 服务同步。

**[打开栖页](https://ktclat.github.io/qiye/)** · **[完整源码与扩展安装](https://github.com/Ktclat/qiye/tree/main)**

本站由 GitHub Actions 从 `main` 的生产模块生成并部署。完整源码、功能说明、隐私说明和测试位于同一仓库的 [main 分支](https://github.com/Ktclat/qiye/tree/main)。历史 `gh-pages` 分支不再是主程序网站发布入口。

## 许可

程序采用 GPL-3.0-only，完整许可见 [LICENSE](LICENSE)，对应源码和构建脚本在 main。字体和图片保留各自许可。

## 首次启用 Pages

打开 [仓库 Settings → Pages](https://github.com/Ktclat/qiye/settings/pages)，选择 **GitHub Actions**，然后点击 **Save**。首次部署完成后，上方演示地址才会显示栖页。可以在 [Actions](https://github.com/Ktclat/qiye/actions) 查看部署结果。

## 更新网站

推送 `main` 会在验证通过后自动部署当前网页。需要重新发布时，在 Actions 中打开 **Verify and publish host → Run workflow → main**；也可以重跑最新提交的 `publish_web` 作业。每次尝试使用独立的网页构建包名称，避免重试时同名包冲突。

本地核对构建时，在源码目录运行：

```sh
python3 scripts/build-pages.py /path/to/qiye-demo
```

输出目录应位于源码仓库之外。脚本生成 `index.html`、`icons/` 品牌图标、`.nojekyll`、`LICENSE` 及本文档。请修改 `main` 中的源码后重新生成，不直接编辑生成的 HTML。

网页的样式、生产模块、字体和栖页品牌图标均已内联，无需 Node.js 或服务器构建。网站图标、壁纸与 WebDAV 等联网功能仍受相应服务和浏览器网络策略影响。

部署与数据迁移说明见 [源码仓库的部署指南](https://github.com/Ktclat/qiye/blob/main/docs/DEPLOYMENT.md)。
''', encoding='utf-8')
print(f'Pages files generated in {output}: index.html, icons/, .nojekyll, LICENSE, README.md')
