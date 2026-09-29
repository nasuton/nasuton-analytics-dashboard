import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRows, daysInMonth, dailyPoints, monthStats, comparison, shiftMonth, monthLabel, availablePeriods, safePageUrl, overviewSeries, formatMetric } from '../js/model.js';

const fullMonth = (period, count) => Array.from({ length: daysInMonth(period) }, (_, i) => ({ SessionDate: `${period}-${String(i + 1).padStart(2, '0')}`, SessionCount: count }));
test('日付の欠損はnull、実績ゼロは0。うるう年にも対応', () => {
  const points = dailyPoints([{ SessionDate: '2024-02-01', SessionCount: 0 }], '2024-02');
  assert.equal(points.length, 29); assert.equal(points[0].value, 0); assert.equal(points[1].value, null);
  assert.equal(daysInMonth('2025-02'), 28);
});
test('月の一部だけのデータから月間の比較率を出さない', () => {
  const rows = [...fullMonth('2026-07', 10), { SessionDate: '2026-08-01', SessionCount: 5 }];
  assert.equal(monthStats(rows, '2026-08').total, 5);
  assert.equal(comparison(rows, '2026-08', -1).value, null);
  assert.equal(monthStats(rows, '2026-06').total, null);
});
test('全日分がある場合の前月比・前年同月比とゼロ除算', () => {
  const rows = [...fullMonth('2026-07', 10), ...fullMonth('2026-08', 20), ...fullMonth('2025-08', 40)];
  assert.equal(comparison(rows, '2026-08', -1).value, 100);
  assert.equal(comparison(rows, '2026-08', -1).note, '2026年7月：310 セッション');
  assert.equal(comparison(rows, '2026-08', -12).value, -50);
  assert.equal(comparison(rows, '2026-08', -12).note, '2025年8月：1,240 セッション');
  assert.equal(comparison([...fullMonth('2026-07', 0), ...fullMonth('2026-08', 1)], '2026-08', -1).value, null);
  assert.equal(comparison([...fullMonth('2026-07', 0), ...fullMonth('2026-08', 1)], '2026-08', -1).note, '2026年7月は0セッションのため算出不可');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthLabel('2025-12'), '2025年12月');
  assert.equal(monthLabel('2026-01'), '2026年1月');
});
test('不正な日付・件数・日付重複を拒否', () => {
  assert.throws(() => validateRows('daily', [{ SessionDate: '2026-02-30', SessionCount: 1 }]));
  assert.throws(() => validateRows('daily', [{ SessionDate: '2026-02-01', SessionCount: -1 }]));
  assert.throws(() => validateRows('daily', [...fullMonth('2026-02', 1), { SessionDate: '2026-02-01', SessionCount: 1 }]));
  assert.throws(() => validateRows('country', [{ MonthYear: '2026-08', Country: 'Japan', AccessCount: '3' }]));
});
test('複数データの年月を統合し、HTTP以外の記事リンクを無効化', () => {
  assert.deepEqual(availablePeriods({ daily: [{ SessionDate: '2026-08-01' }], country: [{ MonthYear: '2026-07' }] }), ['2026-07', '2026-08']);
  assert.equal(safePageUrl('javascript:alert(1)'), null);
  assert.equal(safePageUrl('https://nasuton.net/blog/'), 'https://nasuton.net/blog/');
});

const overview = { MonthYear: '2026-08', ActiveUsers: 573, ScreenPageViews: 748, NewUsers: 551, EngagementRate: 0.473684 };
const landing = { MonthYear: '2026-08', Rank: 1, PageTitle: 'テスト <記事>', PageURL: 'https://nasuton.net/blog/test/', Sessions: 50, EngagementRate: 0.5 };
test('サマリーは人数を合算せず、率を100倍し、欠損月と0を区別する', () => {
  const rows = [overview, { ...overview, MonthYear: '2026-07', ActiveUsers: 0, EngagementRate: 0 }];
  validateRows('overview', rows);
  const people = overviewSeries(rows, '2026', 'ActiveUsers');
  assert.equal(people[7].value, 573);
  assert.equal(people[6].value, 0);
  assert.equal(people[5].value, null);
  const rate = overviewSeries(rows, '2026', 'EngagementRate');
  assert.equal(formatMetric(rate[7].value, true), '47.4%');
  assert.equal(formatMetric(rate[6].value, true), '0.0%');
  assert.equal(formatMetric(rate[5].value, true), '—');
  assert.equal(overviewSeries(rows, '2026', 'ScreenPageViews')[7].value, 748);
});
test('サマリーの月重複・不正な人数・0〜1以外の率を拒否', () => {
  assert.throws(() => validateRows('overview', [overview, overview]));
  assert.throws(() => validateRows('overview', [{ ...overview, ActiveUsers: -1 }]));
  for (const invalid of [47.4, -0.1, null, '0.5', NaN]) {
    assert.throws(() => validateRows('overview', [{ ...overview, EngagementRate: invalid }]));
    assert.throws(() => validateRows('landing', [{ ...landing, EngagementRate: invalid }]));
  }
});
test('入口ページは同一URLの別順位を保持し、順位重複・不正値を拒否', () => {
  assert.deepEqual(validateRows('landing', [landing]), [landing]);
  assert.throws(() => validateRows('landing', [landing, landing]));
  assert.equal(validateRows('landing', [landing, { ...landing, Rank: 9, Sessions: 10 }]).length, 2);
  assert.throws(() => validateRows('landing', [{ ...landing, Sessions: 1.5 }]));
  assert.throws(() => validateRows('landing', [{ ...landing, Rank: 0 }]));
  assert.deepEqual(availablePeriods({ overview: [overview], landing: [{ ...landing, MonthYear: '2026-09' }] }), ['2026-08', '2026-09']);
});
