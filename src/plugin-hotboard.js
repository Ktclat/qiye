// SPDX-License-Identifier: GPL-3.0-only
import { fetchPublicJson } from './public-json.js';
import { t } from './i18n.js';

// A fixed public-data endpoint, never a general proxy for plugin-supplied URLs.
const platforms = new Set(['zhihu','weibo','52pojie','baidu','toutiao','thepaper','ithome','sspai','juejin','bilibili','douyin','douban-movie','tieba','v2ex','hupu','ithome-xijiayi','36kr','huxiu','zhihu-daily','guokr']);
const requests = new Map();
async function requireHotboardPermission(url) {
 const api=globalThis.chrome;
 if(api?.runtime?.id&&api.permissions&&!await api.permissions.contains({origins:[new URL(url).origin+'/*']}))
  throw new Error(t('请在窗口标题栏授权热榜访问，然后刷新榜单。'));
}
export async function fetchPluginHotboard(type, { fetcher = fetchPublicJson, permission = requireHotboardPermission, now = Date.now } = {}) {
 if (!platforms.has(type)) throw new Error('Unsupported hotboard platform');
 const cached = requests.get(type);
 if (cached && now() - cached.time < 3000) return cached.promise;
 const url = 'https://uapis.cn/api/v1/misc/hotboard?type=' + encodeURIComponent(type);
 const job = {time: now()};
 job.promise = (async () => { await permission(url); return fetcher(url, {maxBytes:1024*1024}); })();
 requests.set(type, job);
 try { return await job.promise; } catch (error) { if (requests.get(type) === job) requests.delete(type); throw error; }
}
