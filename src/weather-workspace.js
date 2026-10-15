// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText } from './html.js';
import { icon } from './icons.js';
import { cityKey, requestWeather, searchCities } from './weather.js';
import { readWeatherCredentials, validateWeatherCredentials, saveWeatherCredentials, requestWeatherPermission } from './weather-sources.js';
import { readWeatherCities, saveWeatherCities, weatherCityList } from './weather-cities.js';
import { weatherDetail, weatherLocation, weatherSettings, weatherCityCards } from './weather-view.js';

export function bindWeatherWorkspace(root, initial, host) {
  const events = new AbortController(), options = {signal:events.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id === initial.id);
  const alive = () => !events.signal.aborted && root.isConnected && current();
  let baseline = JSON.stringify([initial.title,initial.config]), busy = false;
  let cities = weatherCityList(readWeatherCities(),initial.config.city), metric = 'temperature';
  let cityOpen=(root.clientWidth||window.innerWidth)>760, panel=cityOpen?'cities':'', expanded=false, search=null, results=[], returnFocus=null;

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
    const job = requestWeather(current().config.city,force,current().config);
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
  function hideSearch() {
    search?.abort(); search=null;
    root.querySelectorAll('.weather-search-results').forEach(node=>node.hidden=true);
  }
  function updatePanels() {
    find('#weather-city-panel').hidden=!cityOpen;
    find('#weather-settings-panel').hidden=panel!=='settings';
    find('.weather-panel-shade').hidden=!(panel==='settings'||cityOpen&&root.clientWidth<=760);
    find('[data-detail-action=weather-cities]').setAttribute('aria-expanded',String(cityOpen));
    root.querySelectorAll('[data-detail-action=weather-settings]').forEach(button=>button.setAttribute('aria-expanded',String(panel==='settings')));
  }
  function loadCities() {
    if(!alive()||!current().config.enabled) return;
    for(const city of cities) void requestWeather(city,false,current().config).then(renderCities);
  }
  function togglePanel(next,trigger) {
    if(trigger) returnFocus=trigger;
    if(next==='cities') cityOpen=true;
    else if(!next&&panel!=='settings') cityOpen=false;
    panel=next||(cityOpen?'cities':'');
    hideSearch(); updatePanels();
    if(next==='settings') find('#weather-settings [name=source]').focus();
    else if(next==='cities') {find('#weather-list-query').focus();loadCities();}
    else returnFocus?.focus({preventScroll:true});
  }
  async function save(changes, credentials) {
    if (busy || !alive()) return false;
    busy = true; feedback();
    find('#weather-settings [type=submit]').disabled = true;
    try {
      const permission=requestWeatherPermission(changes.config.city,changes.config,credentials);
      await permission;
      const updated = await host.saveSettings(initial.id,changes,baseline);
      baseline = JSON.stringify([updated.title,updated.config]);
      if(credentials) saveWeatherCredentials(credentials);
      if (!alive()) return false;
      remember(updated.config.city);
      find('#dialog-title').textContent = updated.title;
      find('#weather-settings').outerHTML = weatherSettings(updated);
      renderForecast(true);
      if(panel==='settings') {panel=cityOpen?'cities':'';updatePanels();returnFocus?.focus({preventScroll:true});}
      void loadForecast();loadCities();
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
    const clean = {name:city.name,latitude:city.latitude,longitude:city.longitude,...(city.countryCode?{countryCode:city.countryCode}:{})};
    if (await save({title:current().title,config:{...current().config,city:clean,enabled:true}})) {
      hideSearch();
      find('#weather-city-query').value=''; find('#weather-list-query').value='';
      if(root.clientWidth<=760) {cityOpen=false;panel='';updatePanels();}
      find('[data-detail-action=weather-cities]').focus({preventScroll:true});
    }
  }
  async function searchCity(form) {
    const query=form.querySelector('input').value.trim(),output=form.querySelector('.weather-search-results');
    root.querySelectorAll('.weather-search-results').forEach(node=>node.hidden=node!==output);
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
      togglePanel((next==='cities'?cityOpen:panel===next)?'':next,target);
    } else if (action === 'weather-panel-close') togglePanel('');
    else if (action === 'weather-add-city') { togglePanel('cities');find('#weather-list-query').focus(); }
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
    if (event.target.matches('.weather-city-search')) { void searchCity(event.target); return; }
    if (event.target.id !== 'weather-settings') return;
    const data = new FormData(event.target);
    try {
      const previous=readWeatherCredentials(),clear=data.has('clearKeys');
      const credentials=validateWeatherCredentials({qweatherHost:clear?'':data.get('qweatherHost'),qweatherKey:clear?'':data.get('qweatherKey')||previous.qweatherKey,cwaKey:clear?'':data.get('cwaKey')||previous.cwaKey});
      const city={name:String(data.get('cityName')).trim(),latitude:Number(data.get('latitude')),longitude:Number(data.get('longitude'))};
      if(cityKey(city)===cityKey(current().config.city)&&current().config.city.countryCode) city.countryCode=current().config.city.countryCode;
      void save({title:String(data.get('title')).trim(),config:{city,source:String(data.get('source')),fallback:data.has('fallback'),unit:String(data.get('unit')),enabled:data.has('enabled')}},credentials);
    } catch(error) {find('.weather-settings-status').textContent=error.message;}

  },options);
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const openSearch=root.querySelector('.weather-search-results:not([hidden])');
    if(openSearch) {event.preventDefault();event.stopPropagation();hideSearch();openSearch.closest('form').querySelector('input').focus();}
    else if(panel) {event.preventDefault();event.stopPropagation();togglePanel('');}
  },options);
  root.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.weather-city-search')) hideSearch();
  },options);
  const resize=new ResizeObserver(updatePanels);resize.observe(root);
  updatePanels();
  renderForecast();
  void loadForecast(); loadCities();
  return () => { events.abort(); search?.abort();resize.disconnect(); };
}
