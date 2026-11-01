// Applies a bank's field settings (renamed / removed columns, custom fields) to the grids,
// so every register, tracker and export follows what the upload templates hold.
import { customFieldsFor, isLocked, columnOrder } from './templates';
import { fmtCell } from './ui';

// Flatten each record's custom values to `cf_<key>` so the grid can search, sort, filter and export them.
export function withCustom(rows) {
  return rows.map(r => (r.custom && Object.keys(r.custom).length
    ? { ...r, ...Object.fromEntries(Object.entries(r.custom).map(([k, v]) => ['cf_' + k, v])) } : r));
}

const gridType = (t) => (t === 'money' ? 'money' : t === 'number' ? 'num' : undefined);

/**
 * @param columns     the grid's columns
 * @param register    which upload template governs this grid (master, gwp, payments, commission, claims)
 * @param config      bank config
 * @param keyMap      grid column key → template column key, where they differ (e.g. net_srcc → srcc)
 * @param customOnly  true for trackers: only append the custom fields, leave the standard columns alone
 */
export function applyFields(columns, register, config, keyMap = {}, customOnly = false) {
  const fc = (config?.fields || {})[register] || {};
  const hidden = new Set(fc.hidden || []);
  const labels = fc.labels || {};
  const std = customOnly ? columns : columns
    .filter(c => { const tk = keyMap[c.key] || c.key; return !(hidden.has(tk) && !isLocked(register, tk)); })
    .map(c => { const tk = keyMap[c.key] || c.key; const l = (labels[tk] || '').trim(); return l ? { ...c, label: l } : c; });
  const custom = customFieldsFor(config, register).map(f => ({
    key: 'cf_' + f.key, label: f.label, type: gridType(f.type) === 'money' ? 'money' : undefined,
    render: gridType(f.type) === 'num' ? (r => fmtCell(r['cf_' + f.key], 'int')) : undefined,
    sortValue: r => r['cf_' + f.key],
  }));
  if (customOnly) return [...std, ...custom];
  // follow the template's column order; columns with no template counterpart (computed ones) stay after the column they followed
  const rank = new Map(columnOrder(register, config).map((k, i) => [k, i]));
  let last = -1, n = 0;
  return [...std, ...custom]
    .map(c => { const tk = c.key.startsWith('cf_') ? 'cf:' + c.key.slice(3) : (keyMap[c.key] || c.key); if (rank.has(tk)) { last = rank.get(tk); n = 0; return [last, c]; } return [last + ++n / 1000, c]; })
    .sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
