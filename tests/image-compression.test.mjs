// SPDX-License-Identifier: GPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnimatedImage, chooseCompressedBlob, compressImage, isCompressibleImage,
  MAX_IMAGE_INPUT_BYTES,
} from '../src/image-compression.js';
import { getWidgetDefinition, newWidgetConfig } from '../src/widget-registry.js';

const bytes = (size, mime = 'image/webp') => new Blob([new Uint8Array(size)], {type: mime});

test('image compressor widget is registered without persisting images', () => {
  const widget = getWidgetDefinition('image-compressor');
  assert.equal(widget.type, 'image-compressor');
  assert.deepEqual(newWidgetConfig('image-compressor'), {});
  assert.ok(widget.sizes.includes('1x1'));
  assert.ok(widget.render({size:'2x2'}).includes('data-image-compressor-open'));
});

test('selection preserves the original when compression is not smaller', () => {
  const input = bytes(1000, 'image/png');
  assert.strictEqual(chooseCompressedBlob(input, [bytes(1010)]), input);
  assert.strictEqual(chooseCompressedBlob(input, [bytes(995)]), input);
  assert.equal(chooseCompressedBlob(input, [bytes(850)]).size, 850);
  assert.throws(
    () => chooseCompressedBlob(input, [bytes(850)], {maxBytes: 800}),
    /超过壁纸大小上限/
  );
});

test('APNG and animated WebP are detected before canvas flattening', async () => {
  const png = new Uint8Array(20);
  png.set([137,80,78,71,13,10,26,10],0);
  png.set([97,99,84,76],12); // acTL chunk
  assert.equal(await isAnimatedImage(new Blob([png], {type:'image/png'})), true);
  const webp = new Uint8Array(32);
  webp.set([82,73,70,70],0); // RIFF
  webp.set([87,69,66,80],8); // WEBP
  webp.set([86,80,56,88],12); // VP8X
  webp[20] = 0x02; // animation flag
  assert.equal(await isAnimatedImage(new Blob([webp], {type:'image/webp'})), true);
});

test('compressImage keeps original dimensions and selects highest quality that fits', async () => {
  const input = bytes(1000, 'image/jpeg');
  let released = false;
  let drawCalls = 0;
  const canvas = {
    getContext: () => ({drawImage: () => {drawCalls++;}}),
    toBlob: (callback, type, quality) => callback(bytes(Math.round(quality * 1000), type)),
  };
  const result = await compressImage(input, {
    qualityLevels: [0.94, 0.86, 0.70],
    maxBytes: 750,
    decode: async () => ({width: 120, height: 80, close: () => {released = true;}}),
    createCanvas: () => canvas,
  });
  assert.equal(result.changed, true);
  assert.equal(result.outputBytes, 700);
  assert.equal(result.type, 'image/webp');
  assert.equal(result.width, 120);
  assert.equal(result.height, 80);
  assert.equal(drawCalls, 1);
  assert.equal(released, true);
});

test('compression never increases file size and fails safely above the target', async () => {
  const input = bytes(1000, 'image/jpeg');
  const fake = (size) => ({
    decode: async () => ({width:32,height:32,close(){}}),
    createCanvas: () => ({
      getContext: () => ({drawImage(){}}),
      toBlob: callback => callback(bytes(size)),
    }),
  });
  const unchanged = await compressImage(input, {...fake(1100), quality:0.9});
  assert.strictEqual(unchanged.blob, input);
  assert.equal(unchanged.changed, false);
  await assert.rejects(
    compressImage(input, {...fake(900), maxBytes:850}),
    /超过壁纸大小上限/
  );
  await assert.rejects(
    compressImage({size:MAX_IMAGE_INPUT_BYTES+1,type:'image/jpeg'}),
    /32 MiB/
  );
  assert.equal(isCompressibleImage(bytes(100,'image/gif')), false);
});

test('abort before processing does not decode the image', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compressImage(bytes(100, 'image/jpeg'), {signal:controller.signal}),
    error => error.name === 'AbortError'
  );
});
