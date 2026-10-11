// SPDX-License-Identifier: GPL-3.0-only
import { appendLink, safeUrl } from './src/core.js';

const ADD_MENU_ID = 'qiye-add-page';

async function installMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: ADD_MENU_ID,
    title: '添加到栖页',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installMenu().catch(() => {
    // A failed menu installation leaves all stored user data untouched.
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#C96760' });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== ADD_MENU_ID) return;
  const checkedUrl = safeUrl(info.linkUrl || info.pageUrl || tab?.url);
  if (!checkedUrl) return;
  const title = info.linkUrl
    ? (info.selectionText?.trim() || new URL(checkedUrl).hostname)
    : (tab?.title || new URL(checkedUrl).hostname);
  appendLink({ url: checkedUrl, title }).then(result => {
    chrome.action.setBadgeText({ text: result.duplicate ? '已存' : '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#538B79' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3500);
  }).catch(() => {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#C96760' });
    chrome.action.setTitle({ title: '添加失败，请打开栖页检查本地存储空间' });
  });
});

chrome.commands.onCommand.addListener(command => {
  if (command === 'open-local-search') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html?search=local') });
  }
});
