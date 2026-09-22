export const number = new Intl.NumberFormat('ja-JP');
export function daysInMonth(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function isPeriod(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000;
}
export function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isPeriod(value.slice(0, 7)) && Number(value.slice(8)) >= 1 && Number(value.slice(8)) <= daysInMonth(value.slice(0, 7));
}
export function validateRows(kind, rows) {
  if (!Array.isArray(rows)) throw new Error('JSONの最上位は配列にしてください。');
  const unique = new Set();
  const countFields = { daily: ['SessionCount'], pages: ['PageViews'], country: ['AccessCount'], channel: ['AccessCount'], overview: ['ActiveUsers', 'ScreenPageViews', 'NewUsers'], landing: ['Sessions'] }[kind];
  if (!countFields) throw new Error('未対応のデータ種別です。');
  rows.forEach((row, i) => {
    const fail = () => { throw new Error(`${i + 1}行目の項目・日付・数値、または重複を確認してください。`); };
    if (!row || typeof row !== 'object') fail();
    if (kind === 'daily' ? !isDate(row.SessionDate) : !isPeriod(row.MonthYear)) fail();
    if (countFields.some(field => !Number.isSafeInteger(row[field]) || row[field] < 0)) fail();
    if (['overview', 'landing'].includes(kind) && (!Number.isFinite(row.EngagementRate) || row.EngagementRate < 0 || row.EngagementRate > 1)) fail();
    const ranked = ['pages', 'landing'].includes(kind);
    const category = kind === 'country' ? row.Country : kind === 'channel' ? row.SessionDefaultChannelGroup : ranked ? row.PageURL : '';
    if (!['daily', 'overview'].includes(kind) && (typeof category !== 'string' || !category.trim())) fail();
    if (ranked && (typeof row.PageTitle !== 'string' || !Number.isInteger(row.Rank) || row.Rank < 1)) fail();
    // 入口ページは取得元の順位を保持。同じURLの別順位を勝手に合算しない。
    const key = kind === 'daily' ? row.SessionDate : JSON.stringify([row.MonthYear, kind === 'landing' ? row.Rank : category]);
    if (unique.has(key)) fail();
    unique.add(key);
  });
  return rows;
}
export const overviewMetrics = {
  ScreenPageViews: { label: '総PV', unit: 'PV' },
  ActiveUsers: { label: 'アクティブユーザー数', unit: '人' },
  NewUsers: { label: '新規ユーザー数', unit: '人' },
  EngagementRate: { label: 'エンゲージメント率', unit: '%', percentage: true },
};
export function overviewSeries(rows, year, field) {
  if (!overviewMetrics[field]) throw new Error('未対応の指標です。');
  const map = new Map(rows.map(row => [row.MonthYear, row]));
  return Array.from({ length: 12 }, (_, i) => {
    const period = `${year}-${String(i + 1).padStart(2, '0')}`;
    const raw = map.get(period)?.[field];
    return { period, value: raw == null ? null : overviewMetrics[field].percentage ? raw * 100 : raw };
  });
}
export function formatMetric(value, percentage = false) {
  return value == null ? '—' : percentage ? `${value.toFixed(1)}%` : number.format(value);
}
export function availablePeriods(data) {
  return [...new Set(Object.entries(data).flatMap(([kind, rows]) => rows.map(row => kind === 'daily' ? row.SessionDate.slice(0, 7) : row.MonthYear)))].sort();
}
export function monthStats(rows, period) {
  const entries = rows.filter(row => row.SessionDate.startsWith(`${period}-`));
  const expected = daysInMonth(period);
  return { total: entries.length ? entries.reduce((sum, row) => sum + row.SessionCount, 0) : null,
    count: entries.length, expected, complete: new Set(entries.map(row => row.SessionDate)).size === expected };
}
export function shiftMonth(period, amount) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function comparison(rows, period, offset) {
  const current = monthStats(rows, period);
  const previousPeriod = shiftMonth(period, offset);
  const previous = monthStats(rows, previousPeriod);
  if (!current.complete || !previous.complete) return { value: null, note: '両月の日次データが揃った場合に表示' };
  if (previous.total === 0) return { value: null, note: `${previousPeriod}は0セッションのため算出不可` };
  return { value: (current.total - previous.total) / previous.total * 100, note: `${previousPeriod}：${number.format(previous.total)} セッション` };
}
export function dailyPoints(rows, period) {
  const map = new Map(rows.map(row => [row.SessionDate, row.SessionCount]));
  return Array.from({ length: daysInMonth(period) }, (_, i) => {
    const date = `${period}-${String(i + 1).padStart(2, '0')}`;
    return { date, value: map.get(date) ?? null, weekend: [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) };
  });
}
export function safePageUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
