#!/usr/bin/env python3
"""Bundle extension modules into one HTML file; optional APIs still need network."""
from pathlib import Path
import re
import base64
root=Path(__file__).resolve().parents[1]
modules=[]
def inline_imports(source):
 return re.sub(r"import\s*\{([^}]+)\}\s*from\s*'\./([a-z-]+)\.js';", lambda m:'const {'+m[1]+'} = __'+m[2].replace('-','_')+';', source)

for name in ('favicons','favicon-view','wallpapers','avatar','core','webdav','widgets','icons','sync-ui','drag','search-history'):
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
html=html.replace('<title>栖页 · 新标签页</title>','<title>栖页 Qiye · 交互预览</title>')
(root/'Qiye-preview.html').write_text(html,encoding='utf-8')
print(f'Qiye-preview.html: {len(html.encode())} bytes; generated from the production modules.')
