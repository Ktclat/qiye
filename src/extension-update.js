// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { APP_VERSION, EXTENSION_ID } from './version.js';

export function extensionUpdatePanel() {
 const id = globalThis.chrome?.runtime?.id;
 const legacy = id && id !== EXTENSION_ID;
 return `<section class="extension-update" aria-labelledby="extension-update-title">
  <header><h4 id="extension-update-title">${t('安装与更新')}</h4><span class="version-badge">v${e(APP_VERSION)}</span></header>
  <p>${t(id ? legacy ? '此安装使用旧标识。迁移到新版前，请先在此版本导出桌面备份。' : '此安装使用固定标识。更新时保留安装目录，覆盖文件后在扩展管理页点击“重新加载”。' : '网页版刷新即可使用已发布的更新。浏览器扩展需要单独下载并更新。')}</p>
  <details><summary>${t('扩展列表出现两个栖页？')}</summary>
   <ol><li>${t('先在有数据的旧版中导出 JSON 备份；两份安装都有内容时，请分别备份。')}</li>
   <li>${t('在新版的“备份与恢复”中导入并核对内容，再移除不需要的旧安装。')}</li>
   <li>${t('重新启用组件源并按需授权。WebDAV 连接和未使用的本地壁纸需另行保留。')}</li></ol>
   <p>${t('0.10.9 及更早版本没有固定标识，首次迁移不会自动合并不同安装的数据。')}</p>
  </details>
  ${id ? `<details><summary>${t('当前安装标识')}</summary><code>${e(id)}</code></details>` : ''}
  <div class="button-row"><button class="secondary-button" data-action="export">${t('导出桌面备份')}</button><button class="secondary-button" data-action="open-backup">${t('备份与恢复')}</button><a class="secondary-button" href="https://github.com/Ktclat/qiye/releases/latest" target="_blank" rel="noopener noreferrer">${t('下载新版')}</a></div>
  <p class="extension-update-footnote">${t('小组件可在“组件源”中检查并更新，无需重新安装栖页。')} <a href="https://github.com/Ktclat/qiye/blob/main/UPDATING.md" target="_blank" rel="noopener noreferrer">${t('完整升级说明')}</a></p>
 </section>`;
}
