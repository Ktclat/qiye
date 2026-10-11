import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_SIZE, MAX_AVATAR_BYTES, MAX_AVATAR_FILE_BYTES,
  validateAvatarDataUrl, normalizeAvatarFile
} from '../src/avatar.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMI6LkDAALoAbn/7VoOAAAAAElFTkSuQmCC';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB9FFFfWHzx/9k=';
const WEBP = 'data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAADwAQCdASoBAAEAAUAmJaACdLoB+AAGXYAAm//PTNeYP8nP/lKvBY3N8AA=';
const originalGlobals = new Map(['createImageBitmap', 'Image', 'URL'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

afterEach(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

const bytesOf = url => Buffer.from(url.split(',')[1], 'base64');
const dataUrl = (bytes, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`;
const fileOf = (url = PNG) => new File([bytesOf(url)], 'avatar', { type: url.slice(5, url.indexOf(';')) });

function pngWithChunk(type, content) {
  const original = bytesOf(PNG);
  const chunk = Buffer.alloc(content.length + 12);
  chunk.writeUInt32BE(content.length, 0);
  chunk.write(type, 4);
  content.copy(chunk, 8);
  return dataUrl(Buffer.concat([original.subarray(0, 33), chunk, original.subarray(33)]));
}

function animatedWebp() {
  const original = bytesOf(WEBP);
  const chunk = Buffer.alloc(18);
  chunk.write('VP8X', 0);
  chunk.writeUInt32LE(10, 4);
  chunk[8] = 2; // Animation flag; 1 x 1 canvas.
  const bytes = Buffer.concat([original.subarray(0, 12), chunk, original.subarray(12)]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return dataUrl(bytes, 'image/webp');
}

function processingFixture({ width = 640, height = 360, output = WEBP } = {}) {
  const fixture = { decoded: 0, released: 0, canvasSizes: [], draws: [], encodings: [], image: { decodedPixels: true } };
  fixture.context = { drawImage(...args) { fixture.draws.push(args); } };
  fixture.options = {
    async decodeImage() {
      fixture.decoded += 1;
      return { image: fixture.image, width, height, release() { fixture.released += 1; } };
    },
    createCanvas(size) {
      fixture.canvasSizes.push(size);
      return {
        getContext() { return fixture.context; },
        toDataURL(...args) { fixture.encodings.push(args); return output; }
      };
    }
  };
  return fixture;
}

test('static PNG, JPEG and WebP data URLs pass the bounded storage boundary', () => {
  for (const url of [PNG, JPEG, WEBP]) assert.equal(validateAvatarDataUrl(url), url);
  const full = pngWithChunk('tEXt', Buffer.alloc(MAX_AVATAR_BYTES - bytesOf(PNG).length - 12));
  assert.equal(bytesOf(full).length, MAX_AVATAR_BYTES);
  assert.equal(validateAvatarDataUrl(full), full);
  assert.throws(() => validateAvatarDataUrl(pngWithChunk('tEXt', Buffer.alloc(MAX_AVATAR_BYTES))), /256 KiB/);
});

test('remote URLs, SVG, invalid base64 and MIME spoofing cannot become avatars', () => {
  for (const value of [null, undefined, {}, '', 'https://example.org/avatar.png', 'blob:https://example.org/avatar',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
    'data:image/png;base64,AA!A', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,aG==',
    PNG.replace('image/png', 'image/jpeg'), WEBP.replace('image/webp', 'image/png'),
    dataUrl(bytesOf(PNG).subarray(0, 30)), dataUrl(bytesOf(WEBP).subarray(0, 25), 'image/webp'),
    dataUrl(bytesOf(JPEG).subarray(0, 30), 'image/jpeg')]) {
    assert.throws(() => validateAvatarDataUrl(value), /头像/);
  }
});

test('animated image containers cannot bypass static avatar backup rules', () => {
  const apngControl = Buffer.alloc(8); apngControl.writeUInt32BE(2);
  const apng = pngWithChunk('acTL', apngControl);
  assert.throws(() => validateAvatarDataUrl(apng), /静态图片/);
  assert.throws(() => validateAvatarDataUrl(animatedWebp()), /静态图片/);
});

test('upload type, byte and dimension limits reject input before image decoding', async () => {
  const fixture = processingFixture();
  const enormousPng = bytesOf(PNG);
  enormousPng.writeUInt32BE(65535, 16);
  enormousPng.writeUInt32BE(65535, 20);
  for (const file of [
    { name: 'fake.png', type: 'image/png', size: 12 },
    new File(['<svg/>'], 'avatar.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([Buffer.alloc(MAX_AVATAR_FILE_BYTES + 1)], 'large.jpg', { type: 'image/jpeg' }),
    new File([bytesOf(PNG)], 'spoofed.jpg', { type: 'image/jpeg' }),
    new File([enormousPng], 'huge-pixels.png', { type: 'image/png' })
  ]) await assert.rejects(normalizeAvatarFile(file, fixture.options), /头像|图片/);
  assert.equal(fixture.decoded, 0);
  assert.equal(fixture.canvasSizes.length, 0);
});

test('portrait, landscape and square photos are centered in a 256 px static avatar', async () => {
  for (const [width, height, sourceCrop] of [
    [640, 360, [140, 0, 360, 360]], [360, 640, [0, 140, 360, 360]], [512, 512, [0, 0, 512, 512]]
  ]) {
    const fixture = processingFixture({ width, height });
    assert.equal(await normalizeAvatarFile(fileOf(), fixture.options), WEBP);
    assert.deepEqual(fixture.canvasSizes, [256]);
    assert.deepEqual(fixture.draws, [[fixture.image, ...sourceCrop, 0, 0, 256, 256]]);
    assert.equal(fixture.context.imageSmoothingQuality, 'high');
    assert.equal(fixture.released, 1);
    assert.equal(AVATAR_SIZE, 256);
  }
});

test('animated local uploads and JPEG input are re-encoded into static PNG or WebP', async () => {
  const apngControl = Buffer.alloc(8); apngControl.writeUInt32BE(2);
  for (const source of [pngWithChunk('acTL', apngControl), animatedWebp(), JPEG]) {
    const fixture = processingFixture({ output: PNG });
    const output = await normalizeAvatarFile(fileOf(source), fixture.options);
    assert.equal(output, PNG, 'PNG is accepted when a browser cannot encode WebP');
    assert.equal(validateAvatarDataUrl(output), output);
    assert.equal(fixture.decoded, 1);
    assert.equal(fixture.released, 1);
  }
});

test('decode failures give a useful error without producing or retaining output', async () => {
  const fixture = processingFixture();
  fixture.options.decodeImage = async () => { throw new Error('corrupt pixel data'); };
  await assert.rejects(normalizeAvatarFile(fileOf(), fixture.options), /图片无法解码/);
  assert.equal(fixture.canvasSizes.length, 0);
  assert.equal(fixture.released, 0);
});

test('decoding resources are released when drawing, encoding or output validation fails', async () => {
  for (const failure of ['no-context', 'draw', 'encode', 'unsafe-output', 'oversized-output']) {
    const fixture = processingFixture();
    fixture.options.createCanvas = () => ({
      getContext() {
        if (failure === 'no-context') return null;
        return { drawImage() { if (failure === 'draw') throw new Error('drawing failed'); } };
      },
      toDataURL() {
        if (failure === 'encode') throw new Error('encoding failed');
        if (failure === 'oversized-output') return pngWithChunk('tEXt', Buffer.alloc(MAX_AVATAR_BYTES));
        return 'data:image/svg+xml;base64,PHN2Zy8+';
      }
    });
    await assert.rejects(normalizeAvatarFile(fileOf(), fixture.options), undefined, failure);
    assert.equal(fixture.released, 1, failure);
  }
});

test('browser ImageBitmap decoding respects photo orientation and closes the bitmap', async () => {
  const fixture = processingFixture();
  let closed = 0, argumentsUsed;
  const bitmap = { width: 320, height: 640, close() { closed += 1; } };
  globalThis.createImageBitmap = async (...args) => { argumentsUsed = args; return bitmap; };
  const file = fileOf(JPEG);
  const output = await normalizeAvatarFile(file, { createCanvas: fixture.options.createCanvas });
  assert.equal(output, WEBP);
  assert.deepEqual(argumentsUsed, [file, { imageOrientation: 'from-image' }]);
  assert.deepEqual(fixture.draws[0], [bitmap, 0, 160, 320, 320, 0, 0, 256, 256]);
  assert.equal(closed, 1);
});

test('HTML image fallback revokes temporary object URLs on both success and failure', async () => {
  delete globalThis.createImageBitmap;
  const revoked = [];
  globalThis.URL = { createObjectURL: () => 'blob:local-avatar', revokeObjectURL: value => revoked.push(value) };
  for (const fails of [false, true]) {
    const fixture = processingFixture();
    let image;
    globalThis.Image = class {
      constructor() { image = this; this.naturalWidth = 1; this.naturalHeight = 1; }
      set src(value) {
        this.currentSource = value;
        if (value) queueMicrotask(() => fails ? this.onerror?.() : this.onload?.());
      }
    };
    const process = normalizeAvatarFile(fileOf(), { createCanvas: fixture.options.createCanvas });
    if (fails) await assert.rejects(process, /图片无法解码/);
    else {
      assert.equal(await process, WEBP);
      assert.equal(image.currentSource, '');
    }
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
  }
  assert.deepEqual(revoked, ['blob:local-avatar', 'blob:local-avatar']);
});
