// SPDX-License-Identifier: GPL-3.0-only
import { getLocale } from './i18n.js';
// The desktop date is a shell feature and uses the platform calendar directly.
export function chineseLunarDate(date = new Date()) {
  if (getLocale() === 'en') return new Intl.DateTimeFormat('en-u-ca-chinese', {month:'short',day:'numeric'}).format(date);
  const days = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {month:'long',day:'numeric'}).formatToParts(date);
  return (parts.find(part => part.type === 'month')?.value || '') + (days[Number(parts.find(part => part.type === 'day')?.value) - 1] || '');
}
