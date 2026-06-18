// Shared auto-calculation formula logic, used by the product wizard
// (ProductsManager), the quotation form (QuotationsPage) and the underwriting
// form (AddClientForm) so all three interpret a field's `autoCalc` identically.
//
// Supported formula strings (field names are slugs, so ':' and ',' are safe separators):
//   sum:a,b,c        → a + b + c
//   pct:a,b,c:18     → (a + b + c) × 18%
//
// Percentage covers the common insurance cases — VAT/levies as a % of premium,
// premium as a % of sum insured, commission as a % of basic, etc.

const toNum = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Parse a formula into { mode, sources, rate } for editing.
export function parseAutoCalc(formula) {
  if (typeof formula === 'string' && formula.startsWith('pct:')) {
    const rest = formula.slice(4);
    const idx = rest.lastIndexOf(':');
    const fieldsStr = idx >= 0 ? rest.slice(0, idx) : rest;
    const rate = idx >= 0 ? rest.slice(idx + 1) : '';
    return { mode: 'pct', sources: fieldsStr.split(',').map(s => s.trim()).filter(Boolean), rate };
  }
  if (typeof formula === 'string' && formula.startsWith('sum:')) {
    return { mode: 'sum', sources: formula.slice(4).split(',').map(s => s.trim()).filter(Boolean), rate: '' };
  }
  return { mode: 'sum', sources: [], rate: '' };
}

// Build a formula string from an editor config. Returns null when there's nothing to compute.
export function buildAutoCalc({ mode, sources, rate } = {}) {
  const src = (sources || []).filter(Boolean);
  if (src.length === 0) return null;
  if (mode === 'pct') return `pct:${src.join(',')}:${rate === '' || rate == null ? 0 : rate}`;
  return `sum:${src.join(',')}`;
}

// Evaluate a formula against a values object (keyed by field name). Returns a number.
export function evaluateAutoCalc(formula, values = {}) {
  const { mode, sources, rate } = parseAutoCalc(formula);
  if (!sources.length) return 0;
  const base = sources.reduce((acc, fn) => acc + toNum(values[fn]), 0);
  return mode === 'pct' ? round2(base * (toNum(rate) / 100)) : round2(base);
}

// Human-readable description, e.g. "18% of (Basic Premium + SRCC)" or "A + B".
// labelFor maps a field name → display label (defaults to the raw name).
export function describeAutoCalc(formula, labelFor = (n) => n) {
  const { mode, sources, rate } = parseAutoCalc(formula);
  if (!sources.length) return '';
  const names = sources.map(labelFor);
  if (mode === 'pct') {
    const base = names.length > 1 ? `(${names.join(' + ')})` : names[0];
    return `${rate || 0}% of ${base}`;
  }
  return names.join(' + ');
}
