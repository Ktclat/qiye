import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE } from '../src/core.js';
import { gridMetrics, widgetDimensions, TILE_SIZES } from '../src/widget-sizes.js';
import { windowMetrics } from '../src/window-layout.js';
import { themeTokens } from '../src/theme.js';
import { renderCatalog } from '../src/widget-catalog.js';
import { listWidgetDefinitions } from '../src/widget-registry.js';

test('grid geometry excludes labels and preserves aspect ratios on smaller viewports', () => {
  const settings = DEFAULT_STATE.settings;
  assert.deepEqual(TILE_SIZES.map(size => widgetDimensions(size, gridMetrics(settings))),
    [{width:60,height:60},{width:60,height:150},{width:150,height:60},{width:150,height:150},{width:330,height:150}]);
  assert.equal(gridMetrics({...settings,labelSize:20}).cell,60);
  assert.ok(Math.abs(gridMetrics(settings,1280).cell-56.8888889)<.001);
  assert.equal(gridMetrics(settings,360).cell,48);
});

test('window presets allocate room, clamp to viewport and do not expose a zoom factor', () => {
  const normal=windowMetrics(100,1440,900),large=windowMetrics(125,1440,900);
  assert.equal(normal.windowWidth,980);assert.equal(large.windowWidth,1225);
  assert.equal(normal.windowHeight,640);assert.equal(large.windowHeight,800);
  const narrow=windowMetrics(150,360,640);
  assert.equal(narrow.windowWidth,336);assert.equal(narrow.drawerWidth,360);
  assert.equal(narrow.windowHeight,616);assert.equal(narrow.scale,undefined);
});

test('one accent switch applies to resolved system theme with readable button ink', () => {
  const settings={...DEFAULT_STATE.settings,theme:'auto',themeColor:'#ffffff'};
  assert.equal(themeTokens(settings,true).theme,'dark');
  assert.equal(themeTokens(settings,false).theme,'light');
  assert.notEqual(themeTokens(settings,true).accent,settings.themeColor);
  assert.deepEqual(themeTokens({...settings,useThemeColor:true},true),{theme:'dark',accent:'#ffffff',ink:'#111820'});
  assert.equal(themeTokens({...settings,useThemeColor:true,themeColor:'#000000'},false).ink,'#ffffff');
});

test('catalog uses independent accessible size controls and inert production renderers', () => {
  const html=renderCatalog({state:DEFAULT_STATE,groupId:'home'});
  const definitions = listWidgetDefinitions();
  assert.equal((html.match(/data-catalog-size=/g)||[]).length, definitions.reduce((count, widget) => count + widget.sizes.length, 0));
  assert.equal((html.match(/class="catalog-stage" inert/g)||[]).length, definitions.length);
  assert.ok(html.includes('data-catalog-widget="countdown" data-preview-size="2x2"'));
  assert.ok(html.includes('--preview-width:330px;--preview-height:150px'));
  assert.ok(!html.includes('name="widgetSize"'));
});
