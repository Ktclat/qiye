#!/usr/bin/env python3
"""Build the static GitHub Pages files in a separate publishing checkout."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='Path to the separate GitHub Pages repository checkout')
output = parser.parse_args().output.resolve()
if output == root or root in output.parents:
    parser.error('Use a separate publishing directory outside the source repository.')

subprocess.run([sys.executable, str(root / 'scripts/build-preview.py')], check=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
html = (root / 'Qiye-preview.html').read_text(encoding='utf-8')
html = html.replace('<title>栖页 Qiye · 交互预览</title>', '<title>栖页 · 新标签页</title>')
output.mkdir(parents=True, exist_ok=True)
(output / 'index.html').write_text(html, encoding='utf-8')
(output / 'icons').mkdir(exist_ok=True)
shutil.copyfile(root / 'icons/icon32.png', output / 'icons/icon32.png')
(output / '.nojekyll').write_text('', encoding='utf-8')
(output / 'README.md').write_text(f'''# 栖页 Qiye · GitHub Pages

栖页 v{version} 的公开网页演示。无需注册或登录，个人桌面保存在各自浏览器中，可通过自己的 WebDAV 服务同步。

**[打开栖页](https://ktclat.github.io/qiye.ktclat.github.io/)** · **[完整源码与扩展安装](https://github.com/Ktclat/qiye)**

本仓库保存由生产模块生成的静态发布文件。完整源码、功能说明、图标智能提取实现、隐私说明和测试位于 [Ktclat/qiye](https://github.com/Ktclat/qiye)。

## 更新网站

在源码仓库运行：

```sh
python3 scripts/build-pages.py /path/to/qiye-pages
```

输出目录应为本发布仓库的本地 checkout。脚本生成 `index.html`、`icons/icon32.png`、`.nojekyll` 和本文档，保留目录中的 Git 历史与其他文件。请修改源码后重新生成，不直接编辑生成的 HTML。

将生成文件提交到本仓库的 `main` 分支，GitHub Pages 会自动部署。Pages 配置为 **Deploy from a branch → main → /(root)**；源码仓库的提交不会自动跨仓库发布。

网页使用相对图标路径，其余样式和生产模块均已内联，无需 Node.js 或服务器构建。网站图标、壁纸与 WebDAV 等联网功能仍受相应服务和浏览器网络策略影响。

部署与数据迁移说明见 [源码仓库的部署指南](https://github.com/Ktclat/qiye/blob/main/docs/DEPLOYMENT.md)。
''', encoding='utf-8')
print(f'Pages files generated in {output}: index.html, icons/icon32.png, .nojekyll, README.md')
