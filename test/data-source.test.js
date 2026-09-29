import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataConfig } from '../js/config.js';
import { buildApiUrl, requestPeriods, volatilePeriods, loadData, loadMonthDetails, clearDataCache } from '../js/data-source.js';

// NodeにはsessionStorageが無いため、Web Storage互換のメモリー実装を差し込みます。
function memoryStorage(map = new Map()) {
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}
const monthOf = url => new URL(url).searchParams.get('startDate').slice(0, 7);
function fakeFetch(calls) {
  return async url => {
    calls.push(url);
    const parsed = new URL(url), month = monthOf(url);
    const payload = parsed.pathname.endsWith('/daily') ? [{ SessionDate: `${month}-01`, SessionCount: 1 }]
      : parsed.pathname.endsWith('/monthly') ? [{ MonthYear: month, ActiveUsers: 2, ScreenPageViews: 3, NewUsers: 1, EngagementRate: 0.5 }] : [];
    return Response.json(payload);
  };
}

test('APIの取得期間・キャッシュ・失敗時の分離', async t => {
  const originalFetch = globalThis.fetch;
  const originalStart = dataConfig.startMonth;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const store = new Map();
  globalThis.sessionStorage = memoryStorage(store);
  t.after(() => {
    globalThis.fetch = originalFetch; dataConfig.startMonth = originalStart; clearDataCache();
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage); else delete globalThis.sessionStorage;
  });

  await t.test('同じ月の月初・月末を指定し、うるう年と日本時間の月替わりに対応', () => {
    assert.equal(new URL(buildApiUrl('daily', '2024-02')).searchParams.get('endDate'), '2024-02-29');
    assert.equal(new URL(buildApiUrl('daily', '2025-02')).searchParams.get('endDate'), '2025-02-28');
    assert.equal(new URL(buildApiUrl('overview', '2026-08')).searchParams.get('startDate'), '2026-08-01');
    dataConfig.startMonth = '2026-08';
    assert.deepEqual(requestPeriods(new Date('2026-08-31T15:00:00Z')), ['2026-08', '2026-09']);
    assert.deepEqual(volatilePeriods(new Date('2026-08-31T15:00:00Z')), ['2026-08', '2026-09']);
    assert.deepEqual(volatilePeriods(new Date('2026-01-15T00:00:00Z')), ['2025-12', '2026-01']);
  });
  await t.test('履歴2種類だけを月別取得、最大4並列。明細は必要月のみで再利用', async () => {
    dataConfig.startMonth = '2026-04'; clearDataCache();
    let active = 0, max = 0;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      active++; max = Math.max(max, active); calls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers, undefined);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      const parsed = new URL(url), month = parsed.searchParams.get('startDate').slice(0, 7);
      const payload = parsed.pathname.endsWith('/daily') ? [{ SessionDate: `${month}-01`, SessionCount: 1 }]
        : parsed.pathname.endsWith('/monthly') ? [{ MonthYear: month, ActiveUsers: 2, ScreenPageViews: 3, NewUsers: 1, EngagementRate: 0.5 }] : [];
      return Response.json(payload);
    };
    const now = new Date('2026-08-20T00:00:00Z');
    const result = await loadData(now);
    assert.deepEqual(result.errors, {});
    assert.equal(result.data.daily.length, 5);
    assert.equal(result.data.overview.length, 5);
    assert.equal(calls.length, 10);
    assert.ok(max <= 4);
    await loadMonthDetails('2026-08', now); assert.equal(calls.length, 14);
    await loadMonthDetails('2026-08', now); assert.equal(calls.length, 14);
    await loadMonthDetails('2026-07', now); assert.equal(calls.length, 18);
    clearDataCache(); await loadMonthDetails('2026-08', now); assert.equal(calls.length, 22);
  });
  await t.test('過去月はsessionStorageから復元し、当月・前月は毎回取得。再読み込みで全件破棄', async () => {
    dataConfig.startMonth = '2026-05'; clearDataCache();
    const now = new Date('2026-08-20T00:00:00Z');
    const calls = [];
    globalThis.fetch = fakeFetch(calls);
    // メモリーキャッシュだけを破棄し、ブラウザーのリロードを再現します。
    const reload = () => { const saved = new Map(store); clearDataCache(); for (const [key, value] of saved) store.set(key, value); };
    await loadData(now);
    assert.equal(calls.length, 8);
    assert.deepEqual([...store.keys()].sort(), ['analytics:v1:daily:2026-05', 'analytics:v1:daily:2026-06', 'analytics:v1:overview:2026-05', 'analytics:v1:overview:2026-06']);
    reload(); calls.length = 0;
    const result = await loadData(now);
    assert.deepEqual(result.errors, {});
    assert.equal(result.data.daily.length, 4);
    assert.deepEqual(calls.map(monthOf).sort(), ['2026-07', '2026-07', '2026-08', '2026-08']);
    calls.length = 0;
    await loadMonthDetails('2026-06', now); assert.equal(calls.length, 4);
    await loadMonthDetails('2026-08', now); assert.equal(calls.length, 8);
    reload(); calls.length = 0;
    await loadMonthDetails('2026-06', now); assert.equal(calls.length, 0);
    await loadMonthDetails('2026-08', now); assert.equal(calls.length, 4);
    clearDataCache(); calls.length = 0;
    assert.equal(store.size, 0);
    await loadData(now); assert.equal(calls.length, 8);
  });
  await t.test('壊れた保存データ・別月の保存データは破棄して再取得', async () => {
    dataConfig.startMonth = '2026-05'; clearDataCache();
    const now = new Date('2026-08-20T00:00:00Z');
    const calls = [];
    globalThis.fetch = fakeFetch(calls);
    store.set('analytics:v1:daily:2026-05', '{"broken"');
    store.set('analytics:v1:overview:2026-05', JSON.stringify([{ MonthYear: '2026-06', ActiveUsers: 2, ScreenPageViews: 3, NewUsers: 1, EngagementRate: 0.5 }]));
    store.set('analytics:v1:daily:2026-06', JSON.stringify([{ SessionDate: '2026-06-01', SessionCount: -1 }]));
    store.set('analytics:v1:overview:2026-06', JSON.stringify([{ MonthYear: '2026-06', ActiveUsers: 9, ScreenPageViews: 9, NewUsers: 9, EngagementRate: 0.9 }]));
    store.set('analytics:other', 'keep');
    const result = await loadData(now);
    assert.deepEqual(result.errors, {});
    assert.deepEqual(calls.map(monthOf).sort(), ['2026-05', '2026-05', '2026-06', '2026-07', '2026-07', '2026-08', '2026-08']);
    assert.equal(result.data.overview.find(row => row.MonthYear === '2026-06').ActiveUsers, 9);
    assert.deepEqual(JSON.parse(store.get('analytics:v1:daily:2026-05')), [{ SessionDate: '2026-05-01', SessionCount: 1 }]);
    clearDataCache();
    assert.deepEqual([...store.keys()], ['analytics:other']);
    store.clear();
  });
  await t.test('sessionStorageが無い・保存に失敗する環境でもメモリーキャッシュで動作', async () => {
    dataConfig.startMonth = '2026-07'; clearDataCache();
    const now = new Date('2026-08-20T00:00:00Z');
    const calls = [];
    globalThis.fetch = fakeFetch(calls);
    globalThis.sessionStorage = undefined;
    assert.deepEqual((await loadData(now)).errors, {});
    await loadMonthDetails('2026-07', now); await loadMonthDetails('2026-07', now);
    assert.equal(calls.length, 8);
    clearDataCache(); calls.length = 0;
    const quotaError = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    globalThis.sessionStorage = { ...memoryStorage(), setItem: quotaError, getItem: quotaError, get length() { return 0; } };
    const result = await loadData(now);
    assert.deepEqual(result.errors, {});
    assert.equal(result.data.daily.length, 2);
    assert.equal(calls.length, 4);
    await loadData(now); assert.equal(calls.length, 4);
    Object.defineProperty(globalThis, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true });
    clearDataCache();
    assert.deepEqual((await loadData(now)).errors, {});
    Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(store), writable: true, configurable: true });
  });
  await t.test('1種類が失敗しても他は表示可能。失敗をキャッシュせず再取得', async () => {
    clearDataCache(); let fail = true, countries = 0;
    globalThis.fetch = async url => {
      if (url.includes('/countries')) { countries++; if (fail) return Response.json({ error: { code: 'origin_not_allowed' } }, { status: 403 }); }
      return Response.json([]);
    };
    const result = await loadMonthDetails('2026-08');
    assert.deepEqual(Object.keys(result.errors), ['country']);
    assert.match(result.errors.country, /Origin/);
    fail = false;
    assert.deepEqual((await loadMonthDetails('2026-08')).errors, {});
    assert.equal(countries, 2);
  });
  await t.test('指定月以外の応答を混ぜない。通信失敗はCORS確認を案内', async () => {
    clearDataCache();
    globalThis.fetch = async url => url.includes('/countries')
      ? Response.json([{ MonthYear: '2025-08', Country: 'Japan', AccessCount: 1 }])
      : Promise.reject(new TypeError('Failed to fetch'));
    const result = await loadMonthDetails('2026-08');
    assert.match(result.errors.country, /指定月以外/);
    assert.match(result.errors.channel, /CORS/);
    assert.deepEqual(result.data.country, []);
  });
});
