// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { escapeText as esc } from './html.js';
import { windowControls } from './widget-app-controls.js';
import { compressImage, isCompressibleImage, MAX_IMAGE_INPUT_BYTES } from './image-compression.js';

const asSize = size => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toFixed(2)} MiB`
  : `${(size / 1024).toFixed(1)} KiB`;

export function imageCompressorWorkspace(item) {
  return `<div class="image-compressor-app">
    <header class="image-compressor-header">
      <div class="image-compressor-heading">${icon('image')}<h2 id="dialog-title">${esc(item.title)}</h2></div>
      ${windowControls()}
    </header>
    <div class="image-compressor-main">
      <div class="image-compressor-drop" role="button" tabindex="0" data-image-drop
        aria-label="${t('选择或拖放需要压缩的图片')}">
        ${icon('image')}
        <strong>${t('选择图片，或拖到这里')}</strong>
        <span>PNG · JPEG · WebP　·　${t('最多 32 MiB')}</span>
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-image-file hidden>
      <div class="image-compressor-settings">
        <label for="image-compressor-quality">${t('画质优先')}　<strong data-image-quality>92%</strong></label>
        <input id="image-compressor-quality" type="range" min="70" max="98" value="92" step="1" data-image-slider>
        <span>${t('分辨率不变 · WebP 输出 · 可能有轻微像素变化')}</span>
      </div>
      <section class="image-compressor-result" data-image-result hidden>
        <div class="image-compressor-stats">
          <div><small>${t('原始大小')}</small><strong data-image-original-size></strong></div>
          <div><small>${t('输出大小')}</small><strong data-image-output-size></strong></div>
          <div><small>${t('节省空间')}</small><strong data-image-saving></strong></div>
        </div>
        <div class="image-compressor-compare">
          <img data-image-original alt="${t('原始图片预览')}">
          <img data-image-optimized alt="${t('压缩后图片预览')}">
          <span class="image-compressor-divider" aria-hidden="true"></span>
        </div>
        <label class="image-compressor-compare-control">${t('对比压缩前后')}
          <input type="range" min="0" max="100" value="50" data-image-compare aria-label="${t('对比压缩前后')}">
        </label>
      </section>
      <p class="image-compressor-status" data-image-status role="status" aria-live="polite">
        ${t('图片只在此窗口处理，不上传到服务器。')}
      </p>
      <div class="image-compressor-actions">
        <button type="button" class="secondary-button" data-image-pick>${t('选择图片')}</button>
        <button type="button" class="secondary-button" data-image-download disabled>${t('下载图片')}</button>
        <button type="button" class="primary-button" data-image-run disabled>${t('开始压缩')}</button>
      </div>
      <p class="image-compressor-privacy">${icon('shield')}${t('原图不会被覆盖，关闭窗口后临时图片立即清除。')}</p>
    </div>
  </div>`;
}

export function bindImageCompressorWorkspace(root) {
  const controller = new AbortController(), {signal} = controller;
  const query = selector => root.querySelector(selector);
  const input = query('[data-image-file]');
  const drop = query('[data-image-drop]');
  const slider = query('[data-image-slider]');
  const before = query('[data-image-original]'), after = query('[data-image-optimized]');
  const resultPanel = query('[data-image-result]');
  const downloadButton = query('[data-image-download]'), runButton = query('[data-image-run]');
  const compare = query('[data-image-compare]'), divider = query('.image-compressor-divider');
  const status = query('[data-image-status]');
  let original = null, result = null, originalUrl = '', outputUrl = '', revision = 0, busy = false;
  const active = token => !signal.aborted && revision === token;

  function note(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }
  function releaseOutput() {
    if (outputUrl && outputUrl !== originalUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = '';
  }
  function releasePreview() {
    releaseOutput();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = '';
    before.removeAttribute('src');
    after.removeAttribute('src');
  }
  function clearResult() {
    result = null;
    resultPanel.hidden = true;
    downloadButton.disabled = true;
    releaseOutput();
    after.removeAttribute('src');
  }
  function selectFile(file) {
    revision++;
    original = null;
    clearResult();
    releasePreview();
    runButton.disabled = true;
    if (!file) return;
    if (!isCompressibleImage(file) || !file.size || file.size > MAX_IMAGE_INPUT_BYTES) {
      note(t('仅支持 32 MiB 以内的 PNG、JPEG 和 WebP 图片。'), true);
      return;
    }
    original = file;
    originalUrl = URL.createObjectURL(file);
    before.src = originalUrl;
    runButton.disabled = false;
    note(`${file.name || t('未命名图片')} · ${asSize(file.size)} · ${t('可开始压缩')}`);
  }

  async function run() {
    if (!original || busy) return;
    clearResult();
    const token = ++revision;
    busy = true;
    runButton.disabled = true;
    note(t('正在本机压缩图片…'));
    try {
      const processed = await compressImage(original, {
        quality: Number(slider.value) / 100,
        signal,
      });
      if (!active(token)) return;
      result = processed;
      outputUrl = processed.changed ? URL.createObjectURL(processed.blob) : originalUrl;
      after.src = outputUrl;
      query('[data-image-original-size]').textContent = asSize(processed.originalBytes);
      query('[data-image-output-size]').textContent = asSize(processed.outputBytes);
      query('[data-image-saving]').textContent = `${(processed.saving * 100).toFixed(1)}%`;
      resultPanel.hidden = false;
      compare.value = '50';
      updateCompare();
      downloadButton.disabled = false;
      note(t(processed.changed ? '压缩完成，原图未修改。' : '保持原图：重新编码没有减少文件大小。'));
    } catch (error) {
      if (active(token)) note(t(error.message || '图片压缩失败'), true);
    } finally {
      busy = false;
      if (!signal.aborted) runButton.disabled = !original;
    }
  }

  function updateCompare() {
    const value = Number(compare.value);
    after.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
    divider.style.left = `${value}%`;
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.detailAction === 'window-expand') {
      const expanded = root.closest('dialog').classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-label', t(expanded ? '还原窗口' : '最大化窗口'));
      button.title = button.getAttribute('aria-label');
      button.innerHTML = icon(expanded ? 'minimize' : 'maximize');
    } else if (button.matches('[data-image-pick]')) {
      input.click();
    } else if (button.matches('[data-image-run]')) {
      void run();
    } else if (button.matches('[data-image-download]') && result) {
      const blob = result.blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const name = original?.name || 'image.png';
      link.href = url;
      link.download = result.changed ? `${name.replace(/\.[^.]*$/, '')}-qiye.webp` : name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, {signal});

  drop.addEventListener('click', () => input.click(), {signal});
  drop.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  }, {signal});
  drop.addEventListener('dragover', event => {
    event.preventDefault();
    drop.classList.add('is-dragging');
  }, {signal});
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'), {signal});
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    selectFile(event.dataTransfer?.files?.[0]);
  }, {signal});
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    selectFile(file);
  }, {signal});
  slider.addEventListener('input', () => {
    query('[data-image-quality]').textContent = `${slider.value}%`;
    revision++;
    clearResult();
    if (original) note(t('画质已调整，请重新压缩。'));
  }, {signal});
  compare.addEventListener('input', updateCompare, {signal});
  updateCompare();
  return () => {
    controller.abort();
    revision++;
    releasePreview();
    original = null;
    result = null;
    input.value = '';
  };
}
