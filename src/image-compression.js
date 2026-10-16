// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
// A local-only, visually lossless-oriented encoder shared by the compression
// workspace and wallpaper upload. Browser canvas WebP is NOT pixel-lossless.
export const MAX_IMAGE_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const COMPRESSIBLE_IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

export function isCompressibleImage(file) {
  return !!file && typeof file.size === 'number' &&
    COMPRESSIBLE_IMAGE_TYPES.includes(file.type);
}

function checkNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('图片压缩已取消', 'AbortError');
}

function chunkName(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** Reject APNG and animated WebP rather than silently flattening to one frame. */
export async function isAnimatedImage(file) {
  if (file.type === 'image/webp') {
    const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    return bytes.length >= 21 &&
      chunkName(bytes, 0) === 'RIFF' &&
      chunkName(bytes, 8) === 'WEBP' &&
      chunkName(bytes, 12) === 'VP8X' &&
      !!(bytes[20] & 0x02);
  }
  if (file.type !== 'image/png') return false;
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || !pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new Error(t('PNG 图片格式无效'));
  }
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = (bytes[offset] * 0x1000000 +
      (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
    if (length > file.size - offset - 12) throw new Error(t('PNG 图片数据损坏'));
    const name = chunkName(bytes, offset + 4);
    if (name === 'acTL') return true;
    if (name === 'IDAT' || name === 'IEND') return false;
    if (offset + length + 12 > bytes.length) break;
    offset += length + 12;
  }
  // An uninspected PNG header is unsafe to flatten.
  throw new Error(t('无法确认 PNG 是否包含动画'));
}

export function chooseCompressedBlob(original, candidates, {maxBytes = Infinity, minimumSaving = 0.02} = {}) {
  if (!original || !Number.isFinite(original.size) || original.size < 1 ||
      !(maxBytes === Infinity || Number.isFinite(maxBytes) && maxBytes > 0) ||
      !Number.isFinite(minimumSaving) || minimumSaving < 0 || minimumSaving >= 1) {
    throw new TypeError(t('图片压缩参数无效'));
  }
  const eligible = candidates.find(blob => blob?.type === 'image/webp' &&
    blob.size > 0 && blob.size <= maxBytes &&
    blob.size <= original.size * (1 - minimumSaving));
  if (eligible) return eligible;
  if (original.size <= maxBytes) return original;
  throw new Error(t('压缩后仍超过壁纸大小上限，请选择更小的图片'));
}

function encodeWebP(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob || blob.type !== 'image/webp') {
          reject(new Error(t('当前浏览器无法编码 WebP 图片')));
        } else {
          resolve(blob);
        }
      }, 'image/webp', quality);
    } catch (error) { reject(error); }
  });
}

/**
 * Preserve dimensions and use high-quality WebP. Revert to the original
 * binary if the result does not save space. Never store an output in state.
 */
export async function compressImage(file, {
  quality = 0.92,
  qualityLevels = null,
  maxBytes = Infinity,
  minimumSaving = 0.02,
  signal,
  decode = globalThis.createImageBitmap,
  createCanvas = () => document.createElement('canvas'),
} = {}) {
  if (!isCompressibleImage(file)) throw new Error(t('仅支持 PNG、JPEG、WebP 静态图片'));
  if (!file.size || file.size > MAX_IMAGE_INPUT_BYTES) throw new Error(t('图片须在 32 MiB 以内'));
  const levels = qualityLevels || [quality];
  if (!Array.isArray(levels) || !levels.length ||
      levels.some(value => !Number.isFinite(value) || value < 0.7 || value > 0.98)) {
    throw new TypeError(t('画质应介于 70% 和 98% 之间'));
  }
  checkNotAborted(signal);
  if (await isAnimatedImage(file)) throw new Error(t('暂不支持动画图片压缩，以免丢失动画帧'));
  checkNotAborted(signal);
  if (typeof decode !== 'function') throw new Error(t('当前浏览器无法读取图片'));
  const bitmap = await decode(file, {imageOrientation: 'from-image'});
  try {
    checkNotAborted(signal);
    const width = bitmap?.width, height = bitmap?.height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_IMAGE_PIXELS) throw new Error(t('图片分辨率过大，最多 3200 万像素'));
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext?.('2d', {alpha: true});
    if (!context || typeof canvas.toBlob !== 'function') throw new Error(t('当前浏览器无法处理图片'));
    context.drawImage(bitmap, 0, 0, width, height);
    const candidates = [];
    for (const level of levels) {
      checkNotAborted(signal);
      const encoded = await encodeWebP(canvas, level);
      candidates.push(encoded);
      // Levels are ordered from best visual quality to most aggressive.
      if (encoded.size <= maxBytes && encoded.size <= file.size * (1 - minimumSaving)) break;
    }
    checkNotAborted(signal);
    const blob = chooseCompressedBlob(file, candidates, {maxBytes, minimumSaving});
    return {
      blob, changed: blob !== file, originalBytes: file.size, outputBytes: blob.size,
      saving: Math.max(0, 1 - blob.size / file.size),
      width, height, type: blob.type,
    };
  } finally {
    bitmap?.close?.();
  }
}

/** Auto-optimize local wallpaper uploads before converting to base64 storage. */
export function compressWallpaperImage(file, {maxBytes, signal} = {}) {
  return compressImage(file, {
    qualityLevels: [0.94, 0.90, 0.86, 0.82, 0.78],
    maxBytes, minimumSaving: 0.03, signal,
  });
}
