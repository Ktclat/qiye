import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

test('the published standalone preview contains a parseable inline application', async () => {
  const html=await readFile(new URL('../Qiye-preview.html',import.meta.url),'utf8');
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source,'standalone application is present');
  assert.doesNotThrow(()=>new Script(source), 'including named import aliases after bundling');
  assert.ok(!/<script[^>]+src="src\/app/.test(html),'preview must work without source modules');
});
