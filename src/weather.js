// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';

export const WEATHER_TTL = 30 * 60000;
const CACHE_KEY = 'qiye.weather.forecasts.v2';
const states = new Map();
const requests = new Map();
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function cityKey(city) { return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`; }
export function temperature(value, unit = 'celsius') { return numeric(value) === null ? '—' : `${Math.round(unit === 'fahrenheit' ? value * 9 / 5 + 32 : value)}°`; }
export function parseWeatherResponse(raw, now = Date.now()) {
  const c = raw?.current;
  if (numeric(c?.temperature_2m) === null || numeric(c?.weather_code) === null) throw new Error(t('天气服务返回的数据不完整'));
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : '';
  const observedAt = timestamp(c.time);
  const daily = (Array.isArray(raw.daily?.time) ? raw.daily.time : []).slice(0,7).map((time, i) => ({time, code:numeric(raw.daily.weather_code?.[i]), min:numeric(raw.daily.temperature_2m_min?.[i]), max:numeric(raw.daily.temperature_2m_max?.[i]), rain:numeric(raw.daily.precipitation_probability_max?.[i]), sunrise:timestamp(raw.daily.sunrise?.[i]), sunset:timestamp(raw.daily.sunset?.[i]), uv:numeric(raw.daily.uv_index_max?.[i]), wind:numeric(raw.daily.wind_speed_10m_max?.[i])})).filter(day=>typeof day.time==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day.time));
  const hourly = (Array.isArray(raw.hourly?.time) ? raw.hourly.time : []).map((time,i) => ({time:timestamp(time), temperature:numeric(raw.hourly.temperature_2m?.[i]), code:numeric(raw.hourly.weather_code?.[i]), isDay:raw.hourly.is_day?.[i] !== 0, rain:numeric(raw.hourly.precipitation_probability?.[i]), wind:numeric(raw.hourly.wind_speed_10m?.[i])})).filter(hour => hour.time && hour.time >= observedAt.slice(0,13)).slice(0,24);
  return {fetchedAt:now, temperature:c.temperature_2m, feelsLike:numeric(c.apparent_temperature), humidity:numeric(c.relative_humidity_2m), wind:numeric(c.wind_speed_10m), pressure:numeric(c.surface_pressure), precipitation:numeric(c.precipitation), code:c.weather_code, isDay:c.is_day !== 0, min:daily[0]?.min ?? null, max:daily[0]?.max ?? null, observedAt, timezone:typeof raw.timezone === 'string' ? raw.timezone : '', daily, hourly, air:null};
}
function readCache(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}')[key];
    const numbers = (object, fields) => object && fields.every(field => object[field] === null || numeric(object[field]) !== null);
    const time = (value, pattern) => typeof value === 'string' && pattern.test(value);
    const valid = value && numeric(value.temperature) !== null && numeric(value.code) !== null
      && numeric(value.fetchedAt) !== null && value.fetchedAt <= Date.now() && Date.now()-value.fetchedAt < 7*86400000
      && typeof value.timezone === 'string' && typeof value.isDay === 'boolean'
      && typeof value.observedAt === 'string' && (!value.observedAt || time(value.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
      && numbers(value, ['feelsLike','humidity','wind','min','max','pressure','precipitation'])
      && (value.air === null || numbers(value.air, ['aqi','pm25','pm10']))
      && Array.isArray(value.daily) && value.daily.length <= 7 && value.daily.every(day => numbers(day,['code','min','max','rain','uv','wind']) && time(day.time,/^\d{4}-\d{2}-\d{2}$/) && typeof day.sunrise === 'string' && typeof day.sunset === 'string')
      && Array.isArray(value.hourly) && value.hourly.length <= 24 && value.hourly.every(hour => numbers(hour,['temperature','code','rain','wind']) && typeof hour.isDay === 'boolean' && time(hour.time,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));
    return valid ? value : null;
  } catch { return null; }
}
function cache(key, data) {
  try {
    const previous = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) || '{}');
    const entries = Object.entries(previous || {}).filter(([k,v])=>k !== key && numeric(v?.fetchedAt) !== null).sort((a,b)=>b[1].fetchedAt-a[1].fetchedAt).slice(0,7);
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({...Object.fromEntries(entries), [key]:data}));
  } catch { /* A full or disabled cache must not discard a forecast. */ }
}
export function weatherState(city) {
  const key = cityKey(city);
  if (!states.has(key)) {
    if (states.size >= 32) states.delete(states.keys().next().value);
    states.set(key, {status:'idle', data:readCache(key), error:'', lastAttempt:0});
  }
  return states.get(key);
}
async function jsonRequest(url, signal) {
  const response = await fetch(url, {signal, credentials:'omit', referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error(t('服务暂不可用（{status}）', {status:response.status}));
  return response.json();
}
export async function searchCities(query, signal) {
  if (query.trim().length < 2) return [];
  const params = new URLSearchParams({name:query.trim(), count:'8', language:getLocale() === 'zh-CN' ? 'zh' : 'en', format:'json'});
  const raw = await jsonRequest(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
  return (Array.isArray(raw.results) ? raw.results : []).filter(c=>typeof c.name === 'string' && numeric(c.latitude) !== null && Math.abs(c.latitude)<=90 && numeric(c.longitude) !== null && Math.abs(c.longitude)<=180).map(c=>({name:c.name.slice(0,60), latitude:c.latitude, longitude:c.longitude, region:[c.admin1,c.country].filter(Boolean).join(', ')}));
}
export function requestWeather(city, force = false) {
  const key = cityKey(city), status = weatherState(city);
  if (requests.has(key)) return requests.get(key);
  if (!force && ((status.data && Date.now()-status.data.fetchedAt < WEATHER_TTL) || Date.now()-status.lastAttempt < 60000)) return Promise.resolve();
  status.status = 'loading'; status.lastAttempt = Date.now();
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), 10000);
  const params = new URLSearchParams({latitude:String(city.latitude), longitude:String(city.longitude), timezone:'auto', forecast_days:'7', current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,surface_pressure,precipitation', daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max', hourly:'temperature_2m,weather_code,precipitation_probability,is_day,wind_speed_10m'});
  const airParams = new URLSearchParams({latitude:String(city.latitude), longitude:String(city.longitude), current:'us_aqi,pm2_5,pm10', timezone:'auto'});
  const job = (async()=>{
    try {
      const [forecast, air] = await Promise.allSettled([jsonRequest(`https://api.open-meteo.com/v1/forecast?${params}`,controller.signal), jsonRequest(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`,controller.signal)]);
      if (forecast.status === 'rejected') throw forecast.reason;
      const data = parseWeatherResponse(forecast.value);
      if (air.status === 'fulfilled' && air.value.current) data.air = {aqi:numeric(air.value.current.us_aqi), pm25:numeric(air.value.current.pm2_5), pm10:numeric(air.value.current.pm10)};
      status.data = data; status.status = 'success'; status.error = ''; cache(key,data);
    } catch (error) {
      status.status = 'error'; status.error = error.name === 'AbortError' ? t('请求超时，请稍后重试') : error instanceof TypeError ? t('网络连接失败，请稍后重试') : error.message;
    } finally { clearTimeout(timer); requests.delete(key); }
  })();
  requests.set(key, job);
  return job;
}

export function weatherDescription(code) {
  if (code === 0) return t("晴");
  if (code === 1) return t("晴间多云");
  if (code === 2) return t("多云");
  if (code === 3) return t("阴");
  if ([45, 48].includes(code)) return t("雾");
  if ([51, 53, 55, 56, 57].includes(code)) return t("毛毛雨");
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return t("雨");
  if ([71, 73, 75, 77, 85, 86].includes(code)) return t("雪");
  if ([95, 96, 99].includes(code)) return t("雷雨");
  return t("天气数据");
}

export function weatherArt(code = 2, isDay = true) {
  const cloud = '<path d="M21 54c-9 0-15-6-15-13s6-13 13-13c3-11 12-17 22-15 10 2 16 9 16 18 9-1 17 4 17 12s-6 13-15 13H21Z" fill="rgba(255,255,255,.96)"/>';
  const sun = '<circle cx="56" cy="23" r="15" fill="#ffd982"/><g stroke="#ffe6a9" stroke-width="2.5" stroke-linecap="round"><path d="M56 2v-2m0 44v3M35 23h-3m45 0h3M41 8l-2-2m34 34 2 2M41 38l-2 2M71 8l2-2"/></g>';
  const moon = '<path d="M64 8a18 18 0 1 0 14 28A18 18 0 0 1 64 8Z" fill="#fff0bd"/>';
  const precipitation = code >= 51 && code < 95;
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  return `<svg class="w-weather-art" viewBox="0 0 84 78" aria-hidden="true">${code <= 2 ? (isDay ? sun : moon) : ''}${code === 0 ? '' : cloud}${precipitation ? `<g stroke="${snow ? '#fff' : '#bfe9ff'}" stroke-width="3" stroke-linecap="round"><path d="m24 64-3 6m20-6-3 6m20-6-3 6"/>${snow ? '<path d="m19 65 7 4m10-4 7 4m10-4 7 4"/>' : ''}</g>` : ''}${code >= 95 ? '<path d="m44 58-9 12h7l-3 9 16-17h-9l4-4Z" fill="#ffda79"/>' : ''}</svg>`;
}

