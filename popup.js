import { themeTokens } from './src/theme.js';
import { t, setLocale, localizeDocument } from './src/i18n.js';
// SPDX-License-Identifier: GPL-3.0-only
import { loadState, addCurrentTab, safeUrl } from './src/core.js';

const form = document.querySelector('#save-form');
const titleInput = document.querySelector('#page-title');
const groupSelect = document.querySelector('#group-select');
const saveButton = document.querySelector('#save-button');
const status = document.querySelector('#status');
const pageUrl = document.querySelector('#page-url');

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function initialize() {
  setLocale('auto');localizeDocument();document.title=t("收藏到栖页");
  try {
    const state = await loadState();
    setLocale(state.settings.language);localizeDocument();document.title=t("收藏到栖页");
    const tokens = themeTokens(state.settings, matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = tokens.theme;
    document.documentElement.style.setProperty('--accent', tokens.accent);
    document.documentElement.style.setProperty('--accent-ink', tokens.ink);
    for (const group of state.groups) {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      option.selected = group.id === state.activeGroupId;
      groupSelect.append(option);
    }
    if (!globalThis.chrome?.tabs) {
      pageUrl.textContent = t("把栖页加载到浏览器后，即可一键收藏当前网页。");
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const checkedUrl = safeUrl(tab?.url);
    if (!checkedUrl) {
      pageUrl.textContent = t("这个页面无法添加");
      showStatus(t("请在普通网页上点击栖页图标。浏览器设置页和新标签页无法收藏。"));
      return;
    }
    pageUrl.textContent = checkedUrl;
    pageUrl.title = checkedUrl;
    titleInput.value = (tab.title || new URL(checkedUrl).hostname).slice(0, 120);
    titleInput.disabled = false;
    groupSelect.disabled = false;
    saveButton.disabled = false;
  } catch (error) { showStatus(error.message || t("读取失败，请重新打开扩展弹窗。"), true); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saveButton.disabled || !titleInput.value.trim()) return;
  saveButton.disabled = true;
  showStatus(t("正在保存…"));
  try {
    const result = await addCurrentTab({ title: titleInput.value.trim(), groupId: groupSelect.value });
    showStatus(result.duplicate ? t("这个网页已经在该分组里了。") : t("已收好，下次打开新标签页就能看到。"));
    saveButton.textContent = result.duplicate ? t("已经收藏 ✓") : t("已添加 ✓");
  } catch (error) {
    showStatus(error.message || t("保存失败，请再试一次。"), true);
    saveButton.disabled = false;
  }
});

document.querySelector('#open-qiye').addEventListener('click', async () => {
  try {
    if (globalThis.chrome?.tabs) await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    else window.open('./index.html', '_blank', 'noopener');
    window.close();
  } catch { showStatus(t("暂时无法打开栖页，请直接新建标签页。"), true); }
});

initialize();
