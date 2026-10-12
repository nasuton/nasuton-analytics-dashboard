import { loadData, loadMonthDetails, clearDataCache, detailKeys, requestPeriods } from './data-source.js';
import { number, availablePeriods, monthStats, comparison, dailyPoints, safePageUrl, overviewMetrics, overviewSeries, formatMetric, monthLabel, pageViewComparison } from './model.js';
import { colors, drawBars, clearChart } from './charts.js';
import { dataConfig } from './config.js';

const $ = id => document.getElementById(id);
let data = Object.fromEntries(['daily', 'overview', ...detailKeys].map(key => [key, []])), errors = {}, periods = [], selected = '';
let busy = false;
const names = { daily: '日別セッション', country: '国別アクティブユーザー', channel: '流入元別アクティブユーザー', pages: '人気ページ', overview: '月次サマリー', landing: '入口ページ',
  device: 'デバイス別アクティブユーザー', browser: 'ブラウザ別アクティブユーザー', os: 'OS別アクティブユーザー', traffic: '参照元別セッション', article: '記事別PV・前月比', search: '検索キーワード' };
const channelColors = { Direct: '#6891a4', 'Organic Search': '#287767', 'Organic Social': '#bba35d', Referral: '#849b73', Unassigned: '#a3aaa7', 'AI Assistant': '#9982af' };

function setOptions(select, values, label) {
  select.replaceChildren(...values.map(value => new Option(label(value), value)));
}
function syncSelectors() {
  const year = selected.slice(0, 4);
  setOptions($('year'), [...new Set(periods.map(p => p.slice(0, 4)))].reverse(), value => `${value}年`);
  $('year').value = year;
  setOptions($('month'), periods.filter(p => p.startsWith(year)).map(p => p.slice(5)), value => `${Number(value)}月`);
  $('month').value = selected.slice(5);
  $('year').disabled = $('month').disabled = !periods.length;
}
function setBusy(value) {
  busy = value;
  $('reload').disabled = value;
  $('overview-metric').disabled = value;
  $('main').setAttribute('aria-busy', String(value));
  $('year').disabled = $('month').disabled = value || !periods.length;
}
function showStatus() {
  const messages = Object.entries(errors).map(([kind, message]) => `${names[kind]}：${message}`);
  if (!periods.length) messages.unshift('表示できるデータがありません。APIの取得先と応答を確認してください。');
  if (!globalThis.Chart) messages.push('グラフライブラリを読み込めません。数値は表で確認できます。');
  $('status').textContent = messages.join('\n'); $('status').hidden = !messages.length;
}
async function fetchDetails() {
  const result = await loadMonthDetails(selected);
  Object.assign(data, result.data);
  for (const key of detailKeys) delete errors[key];
  Object.assign(errors, result.errors);
}
async function choosePeriod(period) {
  if (busy || !periods.includes(period)) return;
  selected = period;
  syncSelectors();
  setBusy(true);
  $('status').hidden = false;
  $('status').textContent = `${monthLabel(period)}のデータをAPIから取得しています…`;
  try { await fetchDetails(); render(); showStatus(); }
  finally { setBusy(false); }
}
function table(id, headers, rows) {
  const node = document.createElement('table');
  const head = node.createTHead().insertRow();
  headers.forEach(label => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); });
  const body = node.createTBody();
  rows.forEach(row => {
    const tr = body.insertRow();
    row.forEach(value => { const td = tr.insertCell(); if (value instanceof Node) td.append(value); else td.textContent = value ?? '—'; });
  });
  $(id).replaceChildren(node);
}
function panelState(id, source, hasData) {
  const missingLibrary = !globalThis.Chart;
  const message = errors[source] ? `${names[source]}のデータを読み込めませんでした。` : !hasData ? '選択した期間のデータはありません。' : missingLibrary ? 'グラフを読み込めませんでした。下の表で数値を確認できます。' : '';
  $(`${id}-empty`).textContent = message;
  $(`${id}-empty`).hidden = !message;
  $(`${id}-chart`).parentElement.hidden = !!message;
  if (message) clearChart(id);
  return hasData && !errors[source] && !missingLibrary;
}
function renderComparison(prefix, offset) {
  const result = comparison(data.daily, selected, offset);
  const value = result.value === null ? '—' : `${result.value > 0 ? '+' : ''}${result.value.toFixed(1)}%`;
  $(`${prefix}-change`).textContent = value;
  $(`${prefix}-change`).className = `metric-value ${result.value > 0 ? 'positive' : result.value < 0 ? 'negative' : ''}`;
  $(`${prefix}-note`).textContent = result.note;
}
function pageLink(row) {
  const href = safePageUrl(row.PageURL);
  const label = document.createElement(href ? 'a' : 'span');
  label.textContent = row.PageTitle || row.PageURL;
  if (href) { label.href = href; label.target = '_blank'; label.rel = 'noopener noreferrer'; }
  return label;
}
function renderOverview() {
  const field = $('overview-metric').value;
  const metric = overviewMetrics[field];
  const row = data.overview.find(item => item.MonthYear === selected);
  $('overview-title').textContent = selected ? `${monthLabel(selected)} 月次サマリー` : '月次サマリー';
  $('overview-pv').textContent = formatMetric(row?.ScreenPageViews);
  $('overview-active').textContent = formatMetric(row?.ActiveUsers);
  $('overview-new').textContent = formatMetric(row?.NewUsers);
  $('overview-rate').textContent = formatMetric(row ? row.EngagementRate * 100 : null, true);
  $('overview-unit').textContent = metric.unit;
  $('overview-chart-title').textContent = `${selected ? `${selected.slice(0, 4)}年 ` : ''}月別 ${metric.label}`;
  const series = selected ? overviewSeries(data.overview, selected.slice(0, 4), field) : [];
  const hasData = series.some(point => point.value !== null);
  $('overview-note').textContent = `${selected && !row ? '選択月のサマリーデータはありません。' : ''}棒を選ぶと、その月の詳細に切り替わります。人数は各月の値で、年間合計にはしません。`;
  if (panelState('overview', 'overview', hasData)) drawBars('overview', {
    labels: series.map(point => `${Number(point.period.slice(5))}月`),
    fullLabels: series.map(point => `${monthLabel(point.period)} ${metric.label}`),
    values: series.map(point => point.value), unit: metric.unit, percentage: !!metric.percentage,
    backgrounds: series.map(point => point.period === selected ? colors.green : colors.light),
    onSelect: i => choosePeriod(series[i].period),
  });
  const yearRows = selected ? data.overview.filter(item => item.MonthYear.startsWith(selected.slice(0, 4))).sort((a, b) => a.MonthYear.localeCompare(b.MonthYear)) : [];
  table('overview-table', ['月', '総PV', 'アクティブユーザー数', '新規ユーザー数', 'エンゲージメント率'],
    yearRows.map(item => [monthLabel(item.MonthYear), number.format(item.ScreenPageViews), number.format(item.ActiveUsers), number.format(item.NewUsers), formatMetric(item.EngagementRate * 100, true)]));
}
function renderExtended() {
  const reportCount = (id, rows) => errors[id] ? '取得失敗・件数未確認' : `全${number.format(rows.length)}件`;
  const reports = [
    { id: 'device', field: 'DeviceCategory', label: 'デバイス' },
    { id: 'browser', field: 'Browser', label: 'ブラウザ' },
    { id: 'os', field: 'OperatingSystem', label: 'OS' },
  ];
  for (const { id, field, label } of reports) {
    const rows = data[id].filter(row => row.MonthYear === selected).sort((a, b) => b.ActiveUsers - a.ActiveUsers);
    const top = rows.slice(0, 10);
    $(`${id}-note`).textContent = `選択月の人数。分類間で同じユーザーが重複する場合があります。グラフは上位10件、表は上位50件（${reportCount(id, rows)}）。`;
    if (panelState(id, id, rows.length > 0)) drawBars(id, { labels: top.map(row => row[field]), values: top.map(row => row.ActiveUsers), horizontal: true, unit: '人' });
    table(`${id}-table`, [label, 'アクティブユーザー数', 'セッション数', 'PV'],
      rows.slice(0, 50).map(row => [row[field], formatMetric(row.ActiveUsers), formatMetric(row.Sessions), formatMetric(row.ScreenPageViews)]));
  }
  const traffic = data.traffic.filter(row => row.MonthYear === selected).sort((a, b) => b.Sessions - a.Sessions);
  const trafficTop = traffic.slice(0, 10);
  $('traffic-note').textContent = `セッション起点の参照元とメディア。グラフは上位10件、表は上位50件（${reportCount('traffic', traffic)}）。`;
  if (panelState('traffic', 'traffic', traffic.length > 0)) drawBars('traffic', {
    labels: trafficTop.map(row => `${row.SessionSource} / ${row.SessionMedium}`), values: trafficTop.map(row => row.Sessions), horizontal: true, backgrounds: colors.blue, unit: 'セッション',
  });
  table('traffic-table', ['参照元', 'メディア', 'セッション数', 'アクティブユーザー数'],
    traffic.slice(0, 50).map(row => [row.SessionSource, row.SessionMedium, formatMetric(row.Sessions), formatMetric(row.ActiveUsers)]));

  const articles = data.article.filter(row => row.MonthYear === selected).sort((a, b) => a.Rank - b.Rank);
  const articleTop = articles.slice(0, 10);
  $('article-title').textContent = selected ? `${monthLabel(selected)} 記事別PV・前月比` : '記事別PV・前月比';
  $('article-note').textContent = `全ページ集計から表示。グラフは上位10件、表は上位50件（${reportCount('article', articles)}）。前月比は同じ条件で完全月を取得できた場合のみ表示します。前月未取得・品質制約ありは「—」、前月0PVは比率を算出しません。`;
  if (panelState('article', 'article', articles.length > 0)) drawBars('article', {
    labels: articleTop.map(row => `${row.Rank}. ${row.PageTitle || row.PageURL}`), values: articleTop.map(row => row.PageViews), horizontal: true, unit: 'PV',
    extraTooltip: i => `前月PV：${formatMetric(articleTop[i].PreviousMonthPageViews)}`,
  });
  table('article-table', ['順位', '記事', 'PV', '前月PV', '増減PV', '前月比'], articles.slice(0, 50).map(row => {
    const { change, percent } = pageViewComparison(row);
    return [row.Rank, pageLink(row), formatMetric(row.PageViews), formatMetric(row.PreviousMonthPageViews),
      change === null ? '—' : `${change > 0 ? '+' : ''}${number.format(change)}`,
      percent === null ? row.PreviousMonthPageViews === 0 ? '前月0PV' : '—' : `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`];
  }));

  const search = data.search.filter(row => row.MonthYear === selected).sort((a, b) => b.Clicks - a.Clicks || b.Impressions - a.Impressions);
  const searchTop = search.slice(0, 10);
  $('search-note').textContent = `${dataConfig.search.siteURL} ／ ${dataConfig.search.searchType}検索。日付は太平洋時間。非公開クエリや取得上限があるため、合計は検索全体の総数を表しません。グラフは上位10件、表は上位50件（${reportCount('search', search)}）。`;
  if (panelState('search', 'search', search.length > 0)) drawBars('search', {
    labels: searchTop.map(row => row.QueryText), values: searchTop.map(row => row.Clicks), horizontal: true, backgrounds: colors.blue, unit: 'クリック',
  });
  table('search-table', ['キーワード', 'クリック数', '表示回数', 'CTR', '平均掲載順位'],
    search.slice(0, 50).map(row => [row.QueryText, formatMetric(row.Clicks), formatMetric(row.Impressions), formatMetric(row.CTR === null ? null : row.CTR * 100, true),
      row.AveragePosition === null ? '—' : row.AveragePosition.toFixed(2)]));
}
function render() {
  renderOverview();
  renderExtended();
  if (!selected) {
    for (const [id, source] of [['monthly', 'daily'], ['daily', 'daily'], ['country', 'country'], ['channel', 'channel'], ['pages', 'pages'], ['landing', 'landing']]) {
      panelState(id, source, false);
      $(`${id}-table`).replaceChildren();
    }
    $('selected-period').textContent = '';
    $('session-total').textContent = $('previous-change').textContent = $('year-change').textContent = '—';
    $('total-note').textContent = '日別セッションの合計';
    $('previous-note').textContent = $('year-note').textContent = '比較データなし';
    $('monthly-title').textContent = '月別セッション数';
    $('daily-title').textContent = '日別セッション数';
    $('landing-title').textContent = '入口ページ TOP10';
    $('landing-note').textContent = '選択月に最初に訪問されたページ。棒はセッション数、表にはエンゲージメント率も表示します。';
    $('monthly-note').textContent = '棒を選ぶと、その月の詳細に切り替わります。';
    $('daily-note').textContent = '選択月の1日〜末日';
    return;
  }
  const stats = monthStats(data.daily, selected);
  $('selected-period').textContent = monthLabel(selected);
  $('session-total').textContent = stats.total === null ? '—' : number.format(stats.total);
  $('total-note').textContent = stats.total === null ? '日別セッションのデータなし' : stats.complete ? '日別セッションの合計' : `${stats.count} / ${stats.expected}日分の合計（未取得日あり）`;
  renderComparison('previous', -1);
  renderComparison('year', -12);

  const year = selected.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const monthly = months.map(period => monthStats(data.daily, period));
  $('monthly-title').textContent = `${year}年 月別セッション数`;
  const partial = months.filter((_, i) => monthly[i].total !== null && !monthly[i].complete);
  $('monthly-note').textContent = `棒を選ぶと、その月の詳細に切り替わります。${partial.length ? ` ※ ${partial.map(p => `${Number(p.slice(5))}月`).join('・')}は一部の日付のみ集計しています。` : ''}`;
  if (panelState('monthly', 'daily', monthly.some(m => m.total !== null))) {
    drawBars('monthly', { labels: months.map(p => `${Number(p.slice(5))}月`), values: monthly.map(m => m.total),
      fullLabels: months.map((p, i) => `${monthLabel(p)}${monthly[i].total !== null && !monthly[i].complete ? '（一部期間）' : ''}`),
      backgrounds: months.map((p, i) => !monthly[i].complete && monthly[i].total !== null ? colors.gold : p === selected ? colors.green : colors.light),
      unit: 'セッション', onSelect: i => choosePeriod(months[i]) });
  }
  table('monthly-table', ['月', '取得日数', 'セッション数'], months.map((p, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'table-month'; button.textContent = monthLabel(p);
    button.disabled = !periods.includes(p); button.setAttribute('aria-pressed', String(p === selected)); button.addEventListener('click', () => choosePeriod(p));
    return [button, `${monthly[i].count} / ${monthly[i].expected}日`, monthly[i].total === null ? '未取得' : number.format(monthly[i].total)];
  }));

  for (const [id, field, header] of [['country', 'Country', '国'], ['channel', 'SessionDefaultChannelGroup', '流入元']]) {
    const rows = data[id].filter(row => row.MonthYear === selected).sort((a, b) => b.AccessCount - a.AccessCount);
    $(`${id}-chart`).parentElement.style.height = `${Math.max(260, rows.length * 34 + 40)}px`;
    if (panelState(id, id, rows.length > 0)) drawBars(id, { labels: rows.map(row => row[field]), values: rows.map(row => row.AccessCount), horizontal: true,
      backgrounds: rows.map(row => id === 'channel' ? channelColors[row[field]] ?? colors.blue : colors.green), unit: '人' });
    table(`${id}-table`, [header, 'アクティブユーザー数（人）'], rows.map(row => [row[field], number.format(row.AccessCount)]));
  }
  const pages = data.pages.filter(row => row.MonthYear === selected).sort((a, b) => a.Rank - b.Rank).slice(0, 5);
  if (panelState('pages', 'pages', pages.length > 0)) drawBars('pages', { labels: pages.map(row => `${row.Rank}. ${row.PageTitle}`),
    values: pages.map(row => row.PageViews), horizontal: true, backgrounds: colors.green, unit: 'PV' });
  table('pages-table', ['順位', 'ページ', 'PV'], pages.map(row => {
    return [String(row.Rank).padStart(2, '0'), pageLink(row), number.format(row.PageViews)];
  }));

  const landing = data.landing.filter(row => row.MonthYear === selected).sort((a, b) => a.Rank - b.Rank).slice(0, 10);
  const duplicateLanding = new Set(landing.map(row => row.PageURL)).size < landing.length;
  $('landing-note').textContent = `選択月に最初に訪問されたページ。棒はセッション数、表にはエンゲージメント率も表示します。${duplicateLanding ? ' ※ 同じURLが複数順位に含まれるため、取得元の順位・値をそのまま表示しています。' : ''}`;
  $('landing-title').textContent = `${monthLabel(selected)} 入口ページ TOP10`;
  if (panelState('landing', 'landing', landing.length > 0)) drawBars('landing', {
    labels: landing.map(row => `${row.Rank}. ${row.PageTitle}`), values: landing.map(row => row.Sessions),
    horizontal: true, backgrounds: colors.blue, unit: 'セッション',
    extraTooltip: i => `エンゲージメント率：${formatMetric(landing[i].EngagementRate * 100, true)}`,
  });
  table('landing-table', ['順位', '入口ページ', 'セッション数', 'エンゲージメント率'],
    landing.map(row => [String(row.Rank).padStart(2, '0'), pageLink(row), number.format(row.Sessions), formatMetric(row.EngagementRate * 100, true)]));

  const days = dailyPoints(data.daily, selected);
  $('daily-title').textContent = `${monthLabel(selected)} 日別セッション数`;
  $('daily-note').textContent = `淡い色は土日。${stats.complete ? '全日分のデータがあります。' : '未取得日は空欄です。0件との区別は数値表で確認できます。'}`;
  if (panelState('daily', 'daily', stats.total !== null)) drawBars('daily', { labels: days.map((_, i) => `${i + 1}`), fullLabels: days.map(day => day.date),
    values: days.map(day => day.value), backgrounds: days.map(day => day.weekend ? colors.light : colors.green), unit: 'セッション' });
  table('daily-table', ['日付', 'セッション数'], days.map(day => [day.date, day.value === null ? '未取得' : number.format(day.value)]));
}

// 「再読み込み」ボタンからはキャッシュを破棄して全期間を再取得します。初回表示はsessionStorageの保存分を再利用します。
async function reload(clearCache = false) {
  if (busy) return;
  setBusy(true);
  if (clearCache) clearDataCache();
  $('status').hidden = false;
  $('status').textContent = '年間グラフと前年比較用の履歴を、APIから月ごとに取得しています…';
  try {
    ({ data, errors } = await loadData());
    const actualPeriods = availablePeriods(data);
    // 履歴がない月でも新しい明細だけが登録されている場合があるため、選択できます。
    periods = [...new Set([...requestPeriods(), ...actualPeriods])].sort();
    if (!periods.includes(selected)) selected = actualPeriods.at(-1) ?? periods.at(-1) ?? '';
    $('coverage').textContent = actualPeriods.length ? `収録期間 ${monthLabel(actualPeriods[0])} — ${monthLabel(actualPeriods.at(-1))}` : 'APIのデータ未取得';
    syncSelectors();
    setBusy(true);
    if (selected) await fetchDetails();
    showStatus();
    render();
  } catch (error) {
    $('status').hidden = false;
    $('status').textContent = `表示を更新できませんでした。${error.message}`;
  } finally { setBusy(false); }
}
$('year').addEventListener('change', () => {
  const options = periods.filter(period => period.startsWith($('year').value));
  choosePeriod(options.find(period => period.slice(5) === selected.slice(5)) ?? options.at(-1));
});
$('month').addEventListener('change', () => choosePeriod(`${$('year').value}-${$('month').value}`));
$('reload').addEventListener('click', () => reload(true));
$('overview-metric').addEventListener('change', renderOverview);
// deferの外部ライブラリとmoduleの双方の実行後に描画を開始します。
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => reload(), { once: true });
else reload();
