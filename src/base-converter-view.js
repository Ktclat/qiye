// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { createWidgetDraft } from './widget-drafts.js';
import { COMMON_BASES, RADIX_DIGITS, RADIX_INPUT_LIMIT, convertRadix, formatRadix, prefixedBase } from './base-converter.js';

const drafts = new Map();
const codes = { 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX' };
const names = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制' };
const baseName = base => names[base] ? t(names[base]) : t('{base} 进制', { base });
const baseOptions = selected => Array.from({ length: 35 }, (_, i) => i + 2).map(base => `<option value="${base}" ${base === selected ? 'selected' : ''}>${baseName(base)}</option>`).join('');

export function baseConverterCard(item) {
  const conversion = convertRadix(item.data);
  const results = conversion.results.slice(0, 4);
  return `<div class="radix-card-heading"><span>${icon('code')}${e(item.title || t('进制转换'))}</span><span>2–36</span></div>
    <button type="button" class="radix-card-open" data-action="widget-open" aria-label="${e(item.title || t('进制转换'))}">
      <span class="radix-card-values">${results.length ? results.map(result => `<span class="radix-card-row"><small>${codes[result.base] || result.base}</small><strong>${e(result.display)}</strong></span>`).join('') : `<span class="radix-card-empty">${t(conversion.error ? '检查输入数值' : '输入一个数，同时转换')}</span>`}</span>
      <span class="radix-card-footer">${t('打开转换器')}<span aria-hidden="true">↗</span></span>
    </button>`;
}

function resultRows(data, conversion) {
  return data.targets.map(base => {
    const result = conversion.results.find(entry => entry.base === base);
    const reusable = result?.exact && formatRadix(conversion.value, base, { ...data, groupDigits: false, prefixes: false }).text.length <= RADIX_INPUT_LIMIT;
    const status = !result ? '' : result.recurring ? t('循环小数') : result.exact ? t('精确') : t('已截断');
    return `<article class="radix-result${base === data.base ? ' is-source' : ''}" data-result-base="${base}">
      <div class="radix-result-label"><span class="radix-base-badge">${codes[base] || 'B' + base}</span><span>${baseName(base)}</span><span class="radix-result-status${result && !result.exact ? ' is-approximate' : ''}">${e(status)}</span></div>
      <div class="radix-result-number"><span class="radix-equality" aria-label="${t(result && !result.exact ? '近似值' : '等于')}">${result && !result.exact ? '≈' : '='}</span><output>${e(result?.display || '—')}</output><sub>${base}</sub></div>
      <div class="radix-result-tools"><button type="button" data-radix-use="${base}" ${reusable ? '' : 'disabled'} title="${t('将精确结果设为输入，保持数值不变')}">${icon('refresh')}${t('用作输入')}</button><button type="button" data-radix-copy="${base}" ${result ? '' : 'disabled'} aria-label="${e(t('复制 {base} 进制结果', { base }))}">${icon('copy')}${t(result && !result.exact ? '复制近似值' : '复制')}</button><button type="button" class="radix-remove" data-radix-remove="${base}" ${data.targets.length === 1 ? 'disabled' : ''} aria-label="${e(t('移除 {base} 进制结果', { base }))}" title="${t('移除此结果')}">${icon('close')}</button></div>
    </article>`;
  }).join('');
}

function formatToggle(key, label, checked) {
  return `<label class="radix-toggle"><input type="checkbox" data-radix-option="${key}" ${checked ? 'checked' : ''}><span>${t(label)}</span></label>`;
}

export function baseConverterWorkspace(item) {
  const data = drafts.get(item.id)?.data || item.data;
  return `<div class="radix-app">
    <header class="radix-header"><div class="radix-app-mark" aria-hidden="true">${icon('code')}</div><h2 id="dialog-title" title="${e(item.title)}">${e(item.title)}</h2>${windowControls()}</header>
    <div class="radix-layout">
      <section class="radix-source" aria-label="${t('转换输入')}">
        <div class="radix-section-heading"><h3>${t('输入数值')}</h3><span class="radix-local">${t('本地计算')}</span></div>
        <label class="radix-base-select"><span>${t('输入进制')}</span><select data-radix-base>${baseOptions(data.base)}</select></label>
        <div class="radix-source-presets" role="group" aria-label="${t('常用输入进制')}">${COMMON_BASES.map(base => `<button type="button" data-radix-source="${base}" aria-pressed="${base === data.base}">${base}<small>${codes[base]}</small></button>`).join('')}</div>
        <div class="radix-input-shell"><label class="sr-only" for="radix-input">${t('待转换数值')}</label><textarea id="radix-input" rows="3" maxlength="${RADIX_INPUT_LIMIT}" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="radix-input-status radix-input-help">${e(data.input)}</textarea><span class="radix-input-base" aria-hidden="true">${data.base}</span></div>
        <div class="radix-input-actions"><span data-radix-length></span><button type="button" data-radix-paste>${icon('copy')}${t('粘贴')}</button><button type="button" data-radix-clear>${t('清空')}</button></div>
        <p id="radix-input-status" class="radix-input-status" role="status" aria-live="polite"></p>
        <p id="radix-input-help" class="radix-help">${t('支持负数、小数、空格或下划线分组；粘贴 0b / 0o / 0x 前缀时自动识别进制。')}</p>
        <div class="radix-examples"><span>${t('试一试')}</span><button type="button" data-radix-example="255">255</button><button type="button" data-radix-example="-42">−42</button><button type="button" data-radix-example="0.1">0.1</button></div>
        <details class="radix-format-settings" open><summary>${t('结果格式')}</summary><div class="radix-format"><label class="radix-precision"><span>${t('最大小数位数')}</span><input type="number" min="1" max="128" step="1" value="${data.precision}" data-radix-precision aria-describedby="radix-precision-help"></label><p id="radix-precision-help" class="radix-help">${t('1–128 位；超出时截断，不四舍五入。')}</p>${formatToggle('uppercase', '字母大写 A–Z', data.uppercase)}${formatToggle('groupDigits', '整数位分组', data.groupDigits)}${formatToggle('prefixes', '显示 0b / 0o / 0x 前缀', data.prefixes)}</div></details>
        <details class="radix-guide"><summary>${t('输入规则与精度')}</summary><p>${t('当前可用数字')}</p><code data-radix-digits></code><p>${t('A–Z 代表 10–35，不区分大小写。括号表示循环节，例如 0.(3)。')}</p><p>${t('大整数精确转换；负数保留负号，不使用补码。暂不支持科学计数法。')}</p><p>${t('切换输入进制会重新解释原始数字；用结果的“用作输入”可保持数值不变。')}</p></details>
      </section>
      <section class="radix-results-panel" aria-label="${t('转换结果')}">
        <div class="radix-section-heading"><h3>${t('转换结果')}<span data-radix-count>${data.targets.length}</span></h3><button type="button" class="radix-copy-all" data-radix-copy-all>${icon('copy')}${t('复制全部')}</button></div>
        <div class="radix-target-picker"><div role="group" aria-label="${t('显示的常用进制')}">${COMMON_BASES.map(base => `<button type="button" data-radix-target="${base}" aria-pressed="${data.targets.includes(base)}">${baseName(base)}</button>`).join('')}</div><div class="radix-add-target"><label class="sr-only" for="radix-extra-base">${t('更多进制')}</label><select id="radix-extra-base" data-radix-extra>${baseOptions(36)}</select><button type="button" data-radix-add>${icon('plus')}${t('添加')}</button></div></div>
        <div class="radix-results" data-radix-results>${resultRows(data, convertRadix(data))}</div>
        <p class="radix-results-note">${t('括号内为循环节；≈ 和 … 表示截断值。“用作输入”仅用于精确结果。')}</p>
      </section>
    </div>
    <footer class="radix-footer"><span data-radix-save role="status">${t('已保存在本机')}</span><button type="button" data-radix-retry hidden>${t('重试保存')}</button><span class="radix-feedback" data-radix-feedback role="status" aria-live="polite"></span><span class="radix-range">BASE 2 — 36</span></footer>
  </div>`;
}

export function bindBaseConverter(root, item, host) {
  const controller = new AbortController(), options = { signal: controller.signal };
  let active = true, conversion, noticeTimer;
  let draft = drafts.get(item.id);
  const feedback = message => {
    if (!active) return;
    clearTimeout(noticeTimer);
    root.querySelector('[data-radix-feedback]').textContent = message;
    noticeTimer = setTimeout(() => { if (active) root.querySelector('[data-radix-feedback]').textContent = ''; }, 5000);
  };
  const saveStatus = () => {
    if (!active) return;
    const status = root.querySelector('[data-radix-save]');
    status.textContent = t(draft.error ? '保存失败，请重试' : draft.dirty ? '保存中…' : '已保存在本机');
    status.title = draft.error?.message || '';
    root.querySelector('[data-radix-retry]').hidden = !draft.error;
    if (!draft.dirty && !draft.error) host.refreshCards();
  };
  // A failed write keeps its draft available when this widget is reopened.
  if (!draft) {
    draft = createWidgetDraft(item, (...args) => host.saveData(...args), () => draft.notify?.());
    drafts.set(item.id, draft);
  }
  draft.notify = saveStatus;
  const input = root.querySelector('#radix-input');
  const update = () => {
    const data = draft.data;
    conversion = convertRadix(data);
    root.querySelector('[data-radix-base]').value = String(data.base);
    root.querySelector('.radix-input-base').textContent = data.base;
    root.querySelector('[data-radix-length]').textContent = `${data.input.length} / ${RADIX_INPUT_LIMIT}`;
    root.querySelector('[data-radix-digits]').textContent = RADIX_DIGITS.slice(0, data.base);
    input.setAttribute('aria-invalid', String(Boolean(conversion.error)));
    const status = root.querySelector('#radix-input-status');
    status.classList.toggle('is-error', Boolean(conversion.error));
    const magnitude = conversion.value ? (conversion.value.numerator < 0n ? -conversion.value.numerator : conversion.value.numerator) : 0n;
    status.textContent = conversion.error || (!conversion.value ? t('输入数值后，结果会实时显示。') : conversion.value.denominator === 1n ? t('整数 · {bits} 个二进制位（绝对值）', { bits: magnitude.toString(2).length }) : t('小数 · 已精确解析'));
    root.querySelector('[data-radix-results]').innerHTML = resultRows(data, conversion);
    root.querySelector('[data-radix-count]').textContent = data.targets.length;
    root.querySelector('[data-radix-copy-all]').disabled = !conversion.value;
    for (const button of root.querySelectorAll('[data-radix-source]')) button.setAttribute('aria-pressed', String(Number(button.dataset.radixSource) === data.base));
    for (const button of root.querySelectorAll('[data-radix-target]')) {
      const selected = data.targets.includes(Number(button.dataset.radixTarget));
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = selected && data.targets.length === 1;
    }
    for (const option of root.querySelector('[data-radix-extra]').options) option.disabled = data.targets.includes(Number(option.value));
    const extra = root.querySelector('[data-radix-extra]');
    if (!extra.value || data.targets.includes(Number(extra.value))) extra.value = [...extra.options].find(option => !option.disabled)?.value || '';
    extra.disabled = data.targets.length === 35;
    root.querySelector('[data-radix-add]').disabled = extra.disabled;
  };
  const changed = () => { draft.changed(); update(); };
  const setInput = (value, base = draft.data.base) => {
    draft.data.input = value; draft.data.base = base; input.value = value; changed(); input.focus();
  };
  const acceptPaste = text => {
    if (text.length > RADIX_INPUT_LIMIT) { feedback(t('最多输入 {count} 个字符。', { count: RADIX_INPUT_LIMIT })); return; }
    setInput(text, prefixedBase(text) || draft.data.base);
  };
  const copy = async (text, truncated = false) => {
    try {
      await navigator.clipboard.writeText(text);
      feedback(t(truncated ? '已复制截断值，请留意小数精度。' : '已复制'));
    } catch { feedback(t('无法访问剪贴板，请选中结果后手动复制。')); }
  };
  root.addEventListener('input', event => {
    if (event.target === input && !event.isComposing) { draft.data.input = input.value; changed(); }
  }, options);
  input.addEventListener('compositionend', () => { draft.data.input = input.value; changed(); }, options);
  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text');
    if (text === undefined) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const next = input.value.slice(0, start) + text + input.value.slice(end);
    if (next.length > RADIX_INPUT_LIMIT) { event.preventDefault(); feedback(t('最多输入 {count} 个字符。', { count: RADIX_INPUT_LIMIT })); return; }
    if (start === 0 && end === input.value.length && prefixedBase(text)) { event.preventDefault(); acceptPaste(text); }
  }, options);
  root.addEventListener('change', event => {
    const target = event.target;
    if (target.hasAttribute('data-radix-base')) { draft.data.base = Number(target.value); changed(); }
    if (target.hasAttribute('data-radix-option')) { draft.data[target.dataset.radixOption] = target.checked; changed(); }
    if (target.hasAttribute('data-radix-precision')) {
      if (!target.value || !target.checkValidity()) { target.reportValidity(); return; }
      draft.data.precision = Number(target.value); changed();
    }
  }, options);
  root.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.detailAction === 'window-expand') {
      const dialog = root.closest('dialog'), expanded = dialog.classList.toggle('widget-app-expanded');
      button.setAttribute('aria-pressed', String(expanded));
      button.setAttribute('aria-label', t(expanded ? '还原窗口' : '最大化窗口'));
      button.title = button.getAttribute('aria-label'); button.innerHTML = icon(expanded ? 'minimize' : 'maximize');
    }
    if (button.hasAttribute('data-radix-clear')) setInput('');
    if (button.hasAttribute('data-radix-paste')) {
      try { const text = await navigator.clipboard.readText(); if (active) acceptPaste(text); }
      catch { feedback(t('请在输入框中使用 Ctrl/⌘ + V 粘贴。')); input.focus(); }
    }
    if (button.hasAttribute('data-radix-example')) setInput(button.dataset.radixExample, 10);
    if (button.hasAttribute('data-radix-source')) { draft.data.base = Number(button.dataset.radixSource); changed(); }
    if (button.hasAttribute('data-radix-target')) {
      const base = Number(button.dataset.radixTarget);
      draft.data.targets = draft.data.targets.includes(base) ? draft.data.targets.filter(value => value !== base) : [...draft.data.targets, base];
      changed();
    }
    if (button.hasAttribute('data-radix-add')) {
      const base = Number(root.querySelector('[data-radix-extra]').value);
      if (base >= 2 && base <= 36 && !draft.data.targets.includes(base)) { draft.data.targets.push(base); changed(); }
    }
    if (button.hasAttribute('data-radix-remove') && draft.data.targets.length > 1) {
      draft.data.targets = draft.data.targets.filter(value => value !== Number(button.dataset.radixRemove)); changed();
      root.querySelector('[data-radix-extra]').focus();
    }
    if (button.hasAttribute('data-radix-use') && conversion.value) {
      const base = Number(button.dataset.radixUse);
      const result = formatRadix(conversion.value, base, { ...draft.data, groupDigits: false, prefixes: false });
      if (result.exact && result.text.length <= RADIX_INPUT_LIMIT) setInput(result.text, base);
    }
    if (button.hasAttribute('data-radix-copy') && conversion.value) {
      const result = formatRadix(conversion.value, Number(button.dataset.radixCopy), { ...draft.data, groupDigits: false });
      await copy(result.text, !result.exact);
    }
    if (button.hasAttribute('data-radix-copy-all') && conversion.value) {
      await copy(draft.data.targets.map(base => {
        const result = formatRadix(conversion.value, base, { ...draft.data, groupDigits: false });
        return `${baseName(base)} (${base}): ${result.exact ? '' : '≈ '}${result.display}`;
      }).join('\n'), conversion.results.some(result => !result.exact));
    }
    if (button.hasAttribute('data-radix-retry')) await draft.flush();
  }, options);
  const flush = () => { void draft.flush(); };
  window.addEventListener('pagehide', flush, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); }, options);
  let narrow;
  const layoutObserver = new ResizeObserver(([entry]) => {
    const next = entry.contentRect.width <= 560;
    if (next !== narrow) { root.querySelector('.radix-format-settings').open = !next; narrow = next; }
  });
  layoutObserver.observe(root);
  update(); saveStatus();
  return () => {
    active = false; controller.abort(); layoutObserver.disconnect(); clearTimeout(noticeTimer);
    if (draft.notify === saveStatus) draft.notify = null;
    void draft.flush().then(saved => {
      if (saved && !draft.notify) drafts.delete(item.id);
      if (saved) host.refreshCards();
      else host.toast(t('内容尚未保存，重新打开组件可继续编辑。'));
    });
  };
}
