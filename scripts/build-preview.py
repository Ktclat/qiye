#!/usr/bin/env python3
"""Bundle extension modules into one HTML file; optional APIs still need network."""
from pathlib import Path
import re
import base64
import json
root=Path(__file__).resolve().parents[1]
sandbox=(root/'src/plugin-sandbox.js').read_text(encoding='utf-8').split('`',2)[1]
(root/'widget-sandbox.html').write_text(sandbox,encoding='utf-8')
version=json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
if version != json.loads((root/'package.json').read_text(encoding='utf-8'))['version']:
 raise SystemExit('manifest.json and package.json versions differ')
(root/'src/version.js').write_text('// SPDX-License-Identifier: GPL-3.0-only\n// Generated from manifest.json by scripts/build-preview.py.\nexport const APP_VERSION = '+json.dumps(version)+';\n',encoding='utf-8')
modules=[]
def inline_imports(source):
 def binding(match):
  names = re.sub(r'\s+as\s+', ': ', match[1])
  return 'const {'+names+'} = __'+match[2].replace('-','_')+';'
 return re.sub(r"import\s*\{([^}]+)\}\s*from\s*'\./([a-z0-9-]+)\.js';", binding, source)

IMPORT = re.compile(r"import\s*\{([^}]+)\}\s*from\s*'\./([a-z0-9-]+)\.js';")
ordered = []
visiting = set()
visited = set()

def visit(name):
 if name in visiting: raise SystemExit('Circular module import: ' + name)
 if name in visited: return
 visiting.add(name)
 source = (root/'src'/f'{name}.js').read_text(encoding='utf-8')
 for match in IMPORT.finditer(source): visit(match[2])
 if re.search(r'^\s*import\b', IMPORT.sub('', source), re.M):
  raise SystemExit('Only named relative .js imports are supported: ' + name)
 if re.search(r'^export\s+(?:default|\{|\*)', source, re.M):
  raise SystemExit('Use named declaration exports in: ' + name)
 visiting.remove(name)
 visited.add(name)
 if name != 'app': ordered.append(name)

visit('app')
for name in ordered:
 source=(root/'src'/f'{name}.js').read_text(encoding='utf-8')
 exports=re.findall(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)',source,re.M)
 if not exports: raise SystemExit('No exports in '+name)
 source=re.sub(r'^export\s+','',source,flags=re.M)
 source=inline_imports(source)
 modules.append(f'const __{name.replace("-","_")} = (() => {{\n{source}\nreturn {{'+', '.join(exports)+'};\n})();')
app=(root/'src/app.js').read_text(encoding='utf-8')
app=inline_imports(app)
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>\n'+(root/m[1]).read_text(encoding='utf-8')+'\n</style>',html)
font=base64.b64encode((root/'fonts/inter-latin-variable.woff2').read_bytes()).decode('ascii')
html=html.replace("url('fonts/inter-latin-variable.woff2')", "url('data:font/woff2;base64,"+font+"')")
license_text=(root/'fonts/OFL-Inter.txt').read_text(encoding='utf-8')
html=html.replace('</head>','<!-- Bundled Inter font: copyright and full license\n'+license_text.replace('--','- -')+'\n-->\n</head>')
source='\n'.join(modules)+'\n'+app
source=source.replace('</script','<\\/script')
html=html.replace('<script type="module" src="src/app.js"></script>','<script type="module">\n'+source+'\n</script>')
# Inline brand assets after the application, including dynamically rendered logos.
for asset, mime in [('icons/qiye-icon.svg', 'image/svg+xml'), ('icons/icon32.png', 'image/png')]:
 data=base64.b64encode((root/asset).read_bytes()).decode('ascii')
 html=html.replace(asset, 'data:'+mime+';base64,'+data)
html=html.replace('<title>栖页 · 新标签页</title>','<title>栖页 Qiye · 交互预览</title>')
(root/'Qiye-preview.html').write_text(html,encoding='utf-8')
print(f'Qiye-preview.html: {len(html.encode())} bytes; generated from the production modules.')
