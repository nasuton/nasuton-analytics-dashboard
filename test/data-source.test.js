import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataConfig } from '../js/config.js';
import { buildApiUrl, requestPeriods, loadData, loadMonthDetails, clearDataCache } from '../js/data-source.js';

test('APIの取得期間・キャッシュ・失敗時の分離', async t => {
  const originalFetch = globalThis.fetch;
  const originalStart = dataConfig.startMonth;
  t.after(() => { globalThis.fetch = originalFetch; dataConfig.startMonth = originalStart; clearDataCache(); });

  await t.test('同じ月の月初・月末を指定し、うるう年と日本時間の月替わりに対応', () => {
    assert.equal(new URL(buildApiUrl('daily', '2024-02')).searchParams.get('endDate'), '2024-02-29');
    assert.equal(new URL(buildApiUrl('daily', '2025-02')).searchParams.get('endDate'), '2025-02-28');
    assert.equal(new URL(buildApiUrl('overview', '2026-08')).searchParams.get('startDate'), '2026-08-01');
    dataConfig.startMonth = '2026-08';
    assert.deepEqual(requestPeriods(new Date('2026-08-31T15:00:00Z')), ['2026-08', '2026-09']);
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
    const result = await loadData(new Date('2026-08-20T00:00:00Z'));
    assert.deepEqual(result.errors, {});
    assert.equal(result.data.daily.length, 5);
    assert.equal(result.data.overview.length, 5);
    assert.equal(calls.length, 10);
    assert.ok(max <= 4);
    await loadMonthDetails('2026-08'); assert.equal(calls.length, 14);
    await loadMonthDetails('2026-08'); assert.equal(calls.length, 14);
    await loadMonthDetails('2026-07'); assert.equal(calls.length, 18);
    clearDataCache(); await loadMonthDetails('2026-08'); assert.equal(calls.length, 22);
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
