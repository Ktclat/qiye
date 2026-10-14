// SPDX-License-Identifier: GPL-3.0-only
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCommunitySource } from '../src/community-format.js';
const directory=new URL('../community/widgets/',import.meta.url);
const widgets=await Promise.all((await readdir(directory)).filter(name=>name.endsWith('.json')).sort().map(async name=>JSON.parse(await readFile(new URL(name,directory),'utf8'))));
const source=validateCommunitySource({format:'qiye-widget-source',version:1,name:'栖页社区 / Qiye community',widgets});
const output=new URL('../community/index.json',import.meta.url);
await writeFile(output,JSON.stringify(source,null,2)+'\n');console.log(fileURLToPath(output));
