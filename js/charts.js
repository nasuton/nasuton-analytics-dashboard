import { number } from './model.js';
const instances = new Map();
export const colors = { green: '#287767', light: '#b2cfc2', gold: '#c89b52', blue: '#6891a4' };
export function drawBars(id, { labels, values, horizontal = false, backgrounds = colors.green, unit = '', onSelect, fullLabels = labels, percentage = false, extraTooltip }) {
  const canvas = document.getElementById(`${id}-chart`);
  instances.get(id)?.destroy();
  instances.delete(id);
  if (!globalThis.Chart || !values.some(value => value !== null)) return;
  const chart = new globalThis.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: backgrounds, borderRadius: 4, maxBarThickness: horizontal ? 25 : 40, minBarLength: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
      animation: false,
      interaction: { mode: 'nearest', intersect: true },
      onClick: (_, elements) => { if (onSelect && elements.length) onSelect(elements[0].index); },
      onHover: (event, elements) => { if (event.native?.target) event.native.target.style.cursor = onSelect && elements.length ? 'pointer' : 'default'; },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, backgroundColor: '#233a35', padding: 12,
        callbacks: { title: items => fullLabels[items[0].dataIndex], label: item => `${percentage ? item.raw.toFixed(1) : number.format(item.raw)} ${unit}`,
          afterLabel: item => extraTooltip?.(item.dataIndex) ?? '' } } },
      scales: {
        x: { beginAtZero: true, ...(percentage && horizontal ? { max: 100 } : {}), grid: { display: horizontal, color: '#edf1ed', drawTicks: false }, border: { display: false },
          ticks: { color: '#687873', font: { size: 11 }, padding: 10, maxRotation: 0, autoSkip: true, ...(horizontal ? { precision: 0 } : {}) } },
        y: { beginAtZero: true, ...(percentage && !horizontal ? { max: 100 } : {}), grid: { display: !horizontal, color: '#edf1ed', drawTicks: false }, border: { display: false },
          ticks: { color: '#687873', font: { size: 11 }, padding: 10, autoSkip: false, ...(!horizontal ? { precision: 0 } : {
            callback(value) { const label = String(this.getLabelForValue(value)); const limit = window.innerWidth <= 520 ? 13 : ['pages', 'landing'].includes(id) ? 30 : 22; return label.length > limit ? `${label.slice(0, limit)}…` : label; },
          }) } },
      },
    },
  });
  instances.set(id, chart);
}
export function clearChart(id) { instances.get(id)?.destroy(); instances.delete(id); }
