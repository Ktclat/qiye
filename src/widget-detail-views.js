// SPDX-License-Identifier: GPL-3.0-only
import { t, formatDate } from './i18n.js';
import { parseDate } from './calendar.js';
import { escapeText } from './html.js';
import { weatherState, weatherArt, weatherDescription, temperature, WEATHER_TTL } from './weather.js';
const e = escapeText;
function forecastUpdatedAt(weather) {
  const options = {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'};
  try { return formatDate(new Date(weather.fetchedAt), {...options, timeZone:weather.timezone || undefined}); }
  catch { return formatDate(new Date(weather.fetchedAt), options); }
}
export function weatherDetail(item) {
  const state = weatherState(item.config.city), weather = state.data, unit = item.config.unit;
  const temp = value => temperature(value,unit);
  if (!item.config.enabled) return `<p>${t('请先在组件设置中启用天气。')}</p>`;
  if (!weather) return `<p role="status">${e(state.error || t('正在获取天气'))}</p><button type="button" data-detail-action="weather-refresh">${t('重新加载')}</button>`;
  return `<div class="weather-detail"><div class="weather-detail-current"><div><h3>${e(item.config.city.name)}</h3><strong>${temp(weather.temperature)}${unit==='fahrenheit'?'F':'C'}</strong><p>${weatherDescription(weather.code)} · ${temp(weather.min)} / ${temp(weather.max)}</p></div>${weatherArt(weather.code,weather.isDay)}<button type="button" data-detail-action="weather-refresh" ${state.status==='loading'?'disabled':''}>${t('刷新')}</button></div><p role="status">${state.status==='error'?e(state.error)+' · ':''}${Date.now()-weather.fetchedAt>=WEATHER_TTL?t('缓存'):t('更新')} ${e(forecastUpdatedAt(weather))} · ${e(weather.timezone)}</p><div class="weather-metrics">${[[t('体感'),temp(weather.feelsLike)],[t('湿度'),weather.humidity===null?'—':weather.humidity+'%'],[t('风速'),weather.wind===null?'—':weather.wind+' km/h'],['AQI (US)',weather.air?.aqi ?? '—'],['PM2.5',weather.air?.pm25==null?'—':weather.air.pm25+' μg/m³'],[t('紫外线'),weather.daily[0]?.uv ?? '—'],[t('日出'),weather.daily[0]?.sunrise?.slice(11,16) || '—'],[t('日落'),weather.daily[0]?.sunset?.slice(11,16) || '—']].map(([label,value])=>`<div><span>${label}</span><strong>${e(value)}</strong></div>`).join('')}</div><h4>${t('未来 24 小时')}</h4><div class="hourly-weather">${weather.hourly.map(hour=>`<div><span>${e(hour.time.slice(11,16))}</span>${weatherArt(hour.code ?? 2,hour.isDay)}<strong>${temp(hour.temperature)}</strong><small>${hour.rain===null?'—':hour.rain+'%'}</small></div>`).join('')}</div><h4>${t('未来 7 天')}</h4><div class="daily-weather">${weather.daily.map(day=>`<div><span>${e(parseDate(day.time)?formatDate(parseDate(day.time),{weekday:'short',month:'short',day:'numeric'}):day.time)}</span>${weatherArt(day.code ?? 2)}<span>${weatherDescription(day.code)}</span><strong>${temp(day.min)} / ${temp(day.max)}</strong><small>${day.rain===null?'—':day.rain+'%'}</small></div>`).join('')}</div><p class="help-text">${t('降水概率以百分比显示；时间采用预报城市时区。空气质量不可用时显示 —。')} <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">CAMS</a></p></div>`;
}
