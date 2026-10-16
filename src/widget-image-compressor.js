// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';

// A native, bundled API v3 widget: uploaded bytes are never persisted.
export const imageCompressorWidget = {
  apiVersion: 3,
  type: 'image-compressor',
  title: '图片压缩',
  description: '本机高画质压缩 PNG、JPEG 和 WebP 图片',
  icon: 'image',
  size: '2x2',
  sizes: ['1x1', '1x2', '2x1', '2x2', '4x2'],
  fields: [],
  render({size}) {
    const small = !['2x2', '4x2'].includes(size);
    return `<button class="image-compressor-card" type="button" data-image-compressor-open data-action="widget-open"
      aria-label="${t('打开图片压缩工具')}">
      <span class="image-compressor-card-art" aria-hidden="true">${icon('image')}</span>
      ${small ? '' : `<strong>${t('图片压缩')}</strong><span>${t('拖入图片 · 本机处理')}</span><small>PNG · JPEG · WebP</small>`}
    </button>`;
  },
};
