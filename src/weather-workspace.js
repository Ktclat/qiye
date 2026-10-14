// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText } from './html.js';
import { icon } from './icons.js';
import { cityKey, requestWeather, searchCities } from './weather.js';
import { readWeatherCities, saveWeatherCities, weatherCityList } from './weather-cities.js';
import { weatherDetail, weatherLocation, weatherSettings, weatherCityCards } from './weather-view.js';

export function bindWeatherWorkspace(root, initial, host) {
  const events = new AbortController(), options = {signal:events.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id === initial.id);
  const alive = () => !events.signal.aborted && root.isConnected && current();
  let baseline = JSON.stringify([initial.title,initial.config]), busy = false;
  let cities = weatherCityList(readWeatherCities(),initial.config.city), metric = 'temperature';
  let panel = '', expanded = false, search = null, results = [], returnFocus = null;

  function feedback(message = '') {
    if (!alive()) return;
    find('#weather-feedback').textContent = message;
    find('#weather-feedback').hidden = !message;
  }
  function renderCities() {
    if (!alive()) return;
    const focused = document.activeElement, city = focused?.dataset.weatherCity, remove = focused?.dataset.weatherRemove;
    find('#weather-city-list').innerHTML = weatherCityCards(current(),cities);
    if (city || remove) find(`[${city?'data-weather-city':'data-weather-remove'}="${city || remove}"]`)?.focus({preventScroll:true});
  }
  function renderForecast(reset = false) {
    if (!alive()) return;
    const scroll = find('.weather-horizontal-scroll')?.scrollLeft || 0;
    find('#weather-forecast').innerHTML = weatherDetail(current(),metric);
    find('#weather-location').innerHTML = weatherLocation(current());
    if (!reset && find('.weather-horizontal-scroll')) find('.weather-horizontal-scroll').scrollLeft = scroll;
    if (reset) find('.weather-scroll').scrollTop = 0;
    renderCities();
  }
  async function loadForecast(force = false) {
    if (!alive() || !current().config.enabled) return;
    const job = requestWeather(current().config.city,force);
    renderForecast();
    await job;
    renderForecast();
    if (alive()) host.refreshCards();
  }
  function remember(city) {
    cities = weatherCityList(cities,city);
    try { saveWeatherCities(cities); }
    catch { feedback(t('城市列表未能保存，当前城市设置已保存。')); }
  }
  function togglePanel(next, trigger) {
    panel = next;
    if (trigger) returnFocus = trigger;
    find('#weather-city-panel').hidden = next !== 'cities';
    find('#weather-settings-panel').hidden = next !== 'settings';
    find('.weather-panel-shade').hidden = !next;
    find('[data-detail-action=weather-cities]').setAttribute('aria-expanded',String(next==='cities'));
    find('[data-detail-action=weather-settings]').setAttribute('aria-expanded',String(next==='settings'));
    if (next) {
      find('#weather-search-results').hidden = true;
      find(`#weather-${next==='cities'?'city':'settings'}-panel [data-detail-action=weather-panel-close]`).focus();
    } else returnFocus?.focus({preventScroll:true});
    if (next === 'cities' && current().config.enabled) {
      renderCities();
      for (const city of cities) void requestWeather(city).then(renderCities);
    }
  }
  async function save(changes) {
    if (busy || !alive()) return false;
    busy = true; feedback();
    find('#weather-settings [type=submit]').disabled = true;
    try {
      const updated = await host.saveSettings(initial.id,changes,baseline);
      baseline = JSON.stringify([updated.title,updated.config]);
      if (!alive()) return false;
      remember(updated.config.city);
      find('#dialog-title').textContent = updated.title;
      find('#weather-settings').outerHTML = weatherSettings(updated);
      renderForecast(true);
      togglePanel('');
      void loadForecast();
      return true;
    } catch (error) {
      feedback(error.message);
      if (alive()) find('.weather-settings-status').textContent = error.message;
      return false;
    } finally {
      busy = false;
      if (alive()) find('#weather-settings [type=submit]').disabled = false;
    }
  }
  async function selectCity(city) {
    if (!city || busy) return;
    const clean = {name:city.name,latitude:city.latitude,longitude:city.longitude};
    if (await save({title:current().title,config:{...current().config,city:clean,enabled:true}})) {
      find('#weather-search-results').hidden = true;
      find('#weather-city-query').value = '';
      find('[data-detail-action=weather-cities]').focus({preventScroll:true});
    }
  }
  async function searchCity() {
    const query = find('#weather-city-query').value.trim(), output = find('#weather-search-results');
    search?.abort(); results = [];
    output.hidden = false;
    if (query.length < 2) { output.textContent = t('请输入至少两个字符'); return; }
    const request = search = new AbortController(), timer = setTimeout(()=>request.abort(),8000);
    output.textContent = t('正在搜索…');
    try {
      const found = await searchCities(query,request.signal);
      if (request !== search || !alive()) return;
      results = found;
      output.innerHTML = `<p role="status">${t(found.length?'选择城市查看天气':'没有找到城市，请使用英文名称或填写坐标。')}</p>` + found.map((city,i)=>`<button type="button" data-weather-result="${i}"><strong>${escapeText(city.name)}</strong><span>${escapeText(city.region)}</span></button>`).join('');
      output.querySelector('button')?.focus();
    } catch {
      if (request === search && alive()) output.textContent = t('城市搜索失败，请重试或填写坐标。');
    } finally { clearTimeout(timer); }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('button,[data-weather-dismiss]');
    if (!target) return;
    if (target.dataset.weatherMetric) {
      metric = target.dataset.weatherMetric; renderForecast();
      find(`[data-weather-metric="${metric}"]`)?.focus({preventScroll:true}); return;
    }
    if (target.dataset.weatherCity) { void selectCity(cities.find(city=>cityKey(city)===target.dataset.weatherCity)); return; }
    if (target.dataset.weatherResult !== undefined) { void selectCity(results[Number(target.dataset.weatherResult)]); return; }
    if (target.dataset.weatherRemove) {
      const remaining = cities.filter(city=>cityKey(city)!==target.dataset.weatherRemove);
      try { saveWeatherCities(remaining); cities=remaining; renderCities(); find('[data-detail-action=weather-add-city]').focus(); }
      catch { feedback(t('城市列表未能保存，请重试。')); }
      return;
    }
    if (target.hasAttribute('data-weather-dismiss')) { togglePanel(''); return; }
    const action = target.dataset.detailAction;
    if (action === 'weather-cities' || action === 'weather-settings') {
      const next = action === 'weather-cities' ? 'cities' : 'settings';
      togglePanel(panel===next?'':next,target);
    } else if (action === 'weather-panel-close') togglePanel('');
    else if (action === 'weather-add-city') { togglePanel(''); find('#weather-city-query').focus(); }
    else if (action === 'weather-refresh') void loadForecast(true);
    else if (action === 'weather-enable') void save({title:current().title,config:{...current().config,enabled:true}});
    else if (action === 'window-expand') {
      expanded = !expanded;
      root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.setAttribute('aria-pressed',String(expanded));
      const label = t(expanded?'还原窗口':'最大化窗口');
      target.setAttribute('aria-label',label); target.title = label;
      target.innerHTML = icon(expanded?'minimize':'maximize');
    }
  },options);
  root.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (event.target.id === 'weather-search') { void searchCity(); return; }
    if (event.target.id !== 'weather-settings') return;
    const data = new FormData(event.target);
    void save({title:String(data.get('title')).trim(),config:{city:{name:String(data.get('cityName')).trim(),latitude:Number(data.get('latitude')),longitude:Number(data.get('longitude'))},unit:String(data.get('unit')),enabled:data.has('enabled')}});
  },options);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (panel) { event.preventDefault(); event.stopPropagation(); togglePanel(''); }
    else if (!find('#weather-search-results').hidden) {
      event.preventDefault(); event.stopPropagation(); search?.abort(); search=null;
      find('#weather-search-results').hidden=true; find('#weather-city-query').focus();
    }
  },options);
  root.addEventListener('pointerdown', event => {
    if (!event.target.closest('#weather-search')) find('#weather-search-results').hidden = true;
  },options);
  renderForecast();
  void loadForecast();
  return () => { events.abort(); search?.abort(); };
}
