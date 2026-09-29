import { dataConfig } from './config.js';
import { validateRows, daysInMonth, isPeriod, shiftMonth } from './model.js';

export const detailKeys = ['country', 'channel', 'pages', 'landing'];
const cache = new Map();
let activeRequests = 0;
const queue = [];

// APIへの同時接続は最大4件。
async function limitedRequest(task) {
  if (activeRequests >= 4) await new Promise(resolve => queue.push(resolve));
  else activeRequests++;
  try { return await task(); }
  finally { const next = queue.shift(); if (next) next(); else activeRequests--; }
}
function currentPeriod(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: dataConfig.timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`;
}
export function requestPeriods(now = new Date()) {
  const end = currentPeriod(now);
  if (!isPeriod(dataConfig.startMonth) || dataConfig.startMonth > end) throw new Error('APIの取得開始月を確認してください。');
  const periods = [];
  for (let month = dataConfig.startMonth; month <= end; month = shiftMonth(month, 1)) periods.push(month);
  return periods;
}
// 当月と前月は集計が確定していない可能性があるため、毎回APIから取得します。
export function volatilePeriods(now = new Date()) {
  const current = currentPeriod(now);
  return [shiftMonth(current, -1), current];
}
const storagePrefix = 'analytics:v1:';
const storageKey = (kind, period) => `${storagePrefix}${kind}:${period}`;
const rowPeriod = (kind, row) => kind === 'daily' ? row.SessionDate.slice(0, 7) : row.MonthYear;
function checkRows(kind, period, payload) {
  const rows = validateRows(kind, payload);
  if (rows.some(row => rowPeriod(kind, row) !== period)) throw new Error('APIの応答に指定月以外のデータが含まれています。');
  return rows;
}
// sessionStorageが使えない環境や容量超過では、メモリーキャッシュだけで動作します。
function withStorage(task) {
  try { const storage = globalThis.sessionStorage; return storage ? task(storage) : undefined; } catch { return undefined; }
}
function readStored(kind, period) {
  return withStorage(storage => {
    const raw = storage.getItem(storageKey(kind, period));
    if (raw == null) return undefined;
    try { return checkRows(kind, period, JSON.parse(raw)); }
    catch { storage.removeItem(storageKey(kind, period)); return undefined; }
  });
}
function writeStored(kind, period, rows) {
  withStorage(storage => storage.setItem(storageKey(kind, period), JSON.stringify(rows)));
}
function clearStored() {
  withStorage(storage => {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(storagePrefix)) storage.removeItem(key);
    }
  });
}
export function buildApiUrl(kind, period) {
  if (!isPeriod(period)) throw new Error('取得月が正しくありません。');
  const endpoint = dataConfig.api[kind];
  if (!endpoint) throw new Error('APIの取得先URLが設定されていません。');
  const url = new URL(endpoint);
  url.searchParams.set('startDate', `${period}-01`);
  url.searchParams.set('endDate', `${period}-${daysInMonth(period)}`);
  return url.href;
}
async function fetchMonth(kind, period) {
  try {
    const response = await fetch(buildApiUrl(kind, period), {
      method: 'GET', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(dataConfig.timeoutMs),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (payload?.error?.code === 'origin_not_allowed') throw new Error('API側でこの画面のOriginが許可されていません。');
      if (response.status === 401 || response.status === 403) throw new Error(`APIへのアクセスが許可されていません（HTTP ${response.status}）。`);
      throw new Error(`APIの取得に失敗しました（HTTP ${response.status}）。`);
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('APIが有効なJSONを返しませんでした。'); }
    return checkRows(kind, period, payload);
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('APIの応答がタイムアウトしました。再読み込みしてください。');
    if (error instanceof TypeError) throw new Error('APIに接続できません。通信状況とAPI側のCORS設定を確認してください。');
    throw error;
  }
}
// 確定済みの過去月だけをsessionStorageにも保存し、リロード後の再取得を省きます。
function loadMonth(kind, period, persistent) {
  const key = `${kind}:${period}`;
  if (!cache.has(key)) {
    const stored = persistent ? readStored(kind, period) : undefined;
    const request = stored ? Promise.resolve(stored)
      : limitedRequest(() => fetchMonth(kind, period))
        .then(rows => { if (persistent) writeStored(kind, period, rows); return rows; })
        .catch(error => { cache.delete(key); throw error; });
    cache.set(key, request);
  }
  return cache.get(key);
}
export function clearDataCache() { cache.clear(); clearStored(); }
async function loadKinds(keys, periods, now) {
  const volatile = volatilePeriods(now);
  const result = { data: {}, errors: {} };
  await Promise.all(keys.map(async kind => {
    const results = await Promise.allSettled(periods.map(period => loadMonth(kind, period, !volatile.includes(period))));
    const failed = results.findIndex(item => item.status === 'rejected');
    // 取得失敗で履歴が欠けた場合、種類単位で保留して誤った比較を防ぎます。
    result.data[kind] = failed < 0 ? results.flatMap(item => item.value) : [];
    if (failed >= 0) result.errors[kind] = `${periods[failed]}：${results[failed].reason.message}`;
  }));
  return result;
}
export async function loadData(now = new Date()) {
  const result = await loadKinds(['daily', 'overview'], requestPeriods(now), now);
  for (const key of detailKeys) result.data[key] = [];
  return result;
}
export function loadMonthDetails(period, now = new Date()) { return loadKinds(detailKeys, [period], now); }
