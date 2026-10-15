import test from 'node:test';
import assert from 'node:assert/strict';
import { newBaseConverterData, validateBaseConverterData, parseRadix, formatRadix, convertRadix, prefixedBase } from '../src/base-converter.js';
import { baseConverterWorkspace } from '../src/base-converter-view.js';
import { newWidgetConfig } from '../src/widget-registry.js';
import { newWidgetData } from '../src/widget-data.js';
import { renderWidget } from '../src/widgets.js';
import { DEFAULT_STATE, validateImport, exportState } from '../src/core.js';
import { TILE_SIZES } from '../src/widget-sizes.js';
import { setLocale } from '../src/i18n.js';

const convert = (input, from, to, options = {}) => formatRadix(parseRadix(input, from), to, options);

test('common bases convert simultaneously and handle exact values outside the safe integer range', () => {
  assert.deepEqual(convertRadix(newBaseConverterData()).results.map(result => result.text), ['11111111', '377', '255', 'FF']);
  assert.equal(convert('18446744073709551615', 10, 16).text, 'FFFFFFFFFFFFFFFF');
  assert.equal(convert('9007199254740993', 10, 16).text, '20000000000001');
  assert.equal(convert('-0xFFFFFFFFFFFFFFFF', 16, 10).text, '-18446744073709551615');
  assert.equal(convert('Z'.repeat(512), 36, 2).text, (36n ** 512n - 1n).toString(2));
});

test('all 35 bases round trip large positive and negative integers', () => {
  for (let base = 2; base <= 36; base++) {
    for (const value of [0n, 1n, -1n, 123456789012345678901234567890n, -(2n ** 200n)]) {
      assert.deepEqual(parseRadix(formatRadix({ numerator: value, denominator: 1n }, base).text, base), { numerator: value, denominator: 1n });
    }
  }
});

test('fractions, signs, prefixes, grouping and letter case are parsed without floating point', () => {
  for (const [input, base, numerator, denominator] of [
    ['-0', 10, 0n, 1n], ['+.5', 10, 1n, 2n], ['12.', 10, 12n, 1n],
    ['-0Xf.f', 16, -255n, 16n], ['0b1010.01', 2, 41n, 4n], ['0O7.4', 8, 15n, 2n],
    ['  1 000_000  ', 10, 1000000n, 1n], ['aBc', 16, 2748n, 1n], ['.1', 3, 1n, 3n],
    ['0b10', 16, 2832n, 1n], ['0x', 36, 33n, 1n],
  ]) assert.deepEqual(parseRadix(input, base), { numerator, denominator }, `${input} base ${base}`);
  assert.equal(convert('-10.625', 10, 2).text, '-1010.101');
  assert.equal(prefixedBase(' -0Xf '), 16);
  assert.equal(prefixedBase('123'), null);
});

test('recurring notation is exact and reusable, including nonrecurring leading digits', () => {
  assert.equal(convert('0.1', 10, 2).text, '0.0(0011)');
  assert.equal(convert('0.1', 10, 16).text, '0.1(9)');
  assert.equal(convert('0.(3)', 10, 3).text, '0.1');
  assert.deepEqual(parseRadix('-12.34(56)', 10), { numerator: -61111n, denominator: 4950n });
  assert.deepEqual(parseRadix('0.(9)', 10), { numerator: 1n, denominator: 1n });
  for (let from = 2; from <= 36; from++) {
    const original = parseRadix('1.1', from);
    for (let to = 2; to <= 36; to++) {
      const result = formatRadix(original, to, { precision: 128 });
      assert.equal(result.exact, true);
      assert.deepEqual(parseRadix(result.text, to), original, `base ${from} to ${to}`);
    }
  }
});

test('fractional precision distinguishes exact, recurring and truncated results at the boundary', () => {
  const truncated = convert('0.1', 10, 2, { precision: 4 });
  assert.equal(truncated.display, '0.0001…');
  assert.equal(truncated.exact, false);
  assert.equal(convert('0.1', 10, 2, { precision: 5 }).text, '0.0(0011)');
  assert.equal(convert('0.1', 10, 2, { precision: 5 }).exact, true);
  assert.equal(convert('0.125', 10, 2, { precision: 3 }).text, '0.001');
  assert.equal(convert('0.125', 10, 2, { precision: 3 }).exact, true);
  assert.equal(convert('-0.00001', 10, 2, { precision: 2 }).display, '-0.00…');
  assert.equal(convert('1234567890', 10, 10, { precision: 1 }).text, '1234567890');
});

test('formatted integers can be grouped and prefixed without changing their value', () => {
  assert.equal(convert('-65535.5', 10, 16, { groupDigits: true, prefixes: true, uppercase: false }).text, '-0xffff.8');
  assert.equal(convert('65536', 10, 16, { groupDigits: true, prefixes: true }).text, '0x1 0000');
  assert.equal(convert('65535', 10, 2, { groupDigits: true }).text, '1111 1111 1111 1111');
  assert.equal(convert('1000000', 10, 10, { groupDigits: true }).text, '1 000 000');
});

test('invalid syntax and digits never silently produce partial or stale results', () => {
  for (const [input, base] of [['2', 2], ['0xFF', 10], ['0b2', 2], ['1e3', 10], ['Infinity', 10], ['1.2.3', 10], ['--1', 10], ['.', 10], ['-', 10], ['0x', 16], ['1-2', 10], ['1,000', 10], ['1 .2', 10], ['1_ .2', 10], ['_123', 10], ['1_', 10], ['(3)', 10], ['0.()', 10], ['1'.repeat(513), 10], ['<script>', 10]]) {
    assert.throws(() => parseRadix(input, base), input);
    const conversion = convertRadix({ ...newBaseConverterData(), input, base });
    assert.ok(conversion.error, input);
    assert.deepEqual(conversion.results, [], input);
  }
  assert.equal(parseRadix('', 10), null);
  for (const base of [1, 37, 2.5, '10', NaN]) assert.throws(() => parseRadix('10', base));
});

test('widget data validates limits, stays independent and survives desktop backup restore', () => {
  const data = newWidgetData('base-converter'), other = newWidgetData('base-converter');
  data.targets.push(36); data.input = '-FFFF.F'; data.base = 16;
  assert.deepEqual(other, newBaseConverterData());
  const state = structuredClone(DEFAULT_STATE);
  state.items.push({ id: 'base-test', type: 'widget', widget: 'base-converter', title: '进制转换', groupId: 'home', size: '4x2', config: newWidgetConfig('base-converter'), data });
  assert.deepEqual(validateImport(exportState(state)).items.find(item => item.id === 'base-test').data, data);
  for (const changes of [{ targets: [] }, { targets: [2, 2] }, { targets: [37] }, { input: '1'.repeat(513) }, { base: 1 }, { base: '10' }, { precision: 0 }, { precision: 129 }, { uppercase: 1 }, { groupDigits: 'yes' }, { surprise: true }]) {
    assert.throws(() => validateBaseConverterData({ ...data, ...changes }));
  }
  for (const key of Object.keys(data)) { const incomplete = { ...data }; delete incomplete[key]; assert.throws(() => validateBaseConverterData(incomplete)); }
});

test('all five card sizes expose the converter and escape user content', () => {
  const item = { id: 'radix-test', widget: 'base-converter', title: '<img src=x>', config: {}, data: newBaseConverterData() };
  for (const size of TILE_SIZES) {
    const html = renderWidget({ ...item, size }, DEFAULT_STATE);
    assert.match(html, /data-action="widget-open"/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<img src=x>/);
  }
  const html = baseConverterWorkspace({ ...item, data: { ...item.data, input: '</textarea><script>alert(1)</script>' } });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;\/textarea&gt;/);
  assert.equal((html.match(/data-result-base=/g) || []).length, 4);
});

test('converter labels and validation errors follow the English locale', () => {
  setLocale('en');
  try {
    const html = baseConverterWorkspace({ id: 'radix-en', title: 'Base converter', data: newBaseConverterData() });
    assert.match(html, /Input base/);
    assert.match(html, /Hexadecimal/);
    assert.doesNotMatch(html, /[\u4e00-\u9fff]/);
    assert.throws(() => parseRadix('8', 8), /not a base 8 digit/);
  } finally { setLocale('zh-CN'); }
});
