import { dataConfig } from './config.js';
import { validateRows } from './model.js';

async function loadOne(kind) {
  const endpoint = dataConfig[dataConfig.mode]?.[kind];
  if (!endpoint) throw new Error('取得先URLが設定されていません。');
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'ファイルが見つかりません。' : `読み込みに失敗しました（HTTP ${response.status}）。`);
  // APIが { data: [...] } などを返す場合は、この箇所で配列を取り出します。
  return validateRows(kind, await response.json());
}
export async function loadData() {
  const keys = ['daily', 'country', 'channel', 'pages', 'overview', 'landing'];
  const results = await Promise.allSettled(keys.map(loadOne));
  const data = {}, errors = {};
  results.forEach((result, i) => {
    const key = keys[i];
    data[key] = result.status === 'fulfilled' ? result.value : [];
    if (result.status === 'rejected') errors[key] = result.reason instanceof Error ? result.reason.message : '読み込みに失敗しました。';
  });
  return { data, errors };
}
