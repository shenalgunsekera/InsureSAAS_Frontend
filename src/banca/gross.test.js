// Policy-level premium incl. taxes (Master Register, Renewal Tracker, Outstanding Tracker).
import { buildModel, DEFAULT_CONFIG } from './core';

const policy = (id) => ({ id, policy_no: id, customer: 'A', insurer: 'X', inception: '2026-01-01', expiry: '2026-12-31' });
const txn = (id, policy_id, type, total, extra = {}) => ({ id, policy_id, type, effective_date: '2026-01-01', basic: total, srcc: 0, tc: 0, total, ...extra });
const gross = (policies, txns) => Object.fromEntries(buildModel({ policies, txns, receipts: [], commissions: [], claims: [] }, DEFAULT_CONFIG, '2026-11-04').policies.map(p => [p.id, p.gross_premium]));

test('adds the original, endorsements and cancellations', () => {
  expect(gross([policy('A')], [txn('1', 'A', 'New', 100, { gross_premium: 120.1 }), txn('2', 'A', 'Endorsement', 10, { gross_premium: 12.2 }), txn('3', 'A', 'Cancellation', -50, { gross_premium: -60.3 })]).A).toBe(72);
});
test('reversed transactions are left out', () => {
  expect(gross([policy('A')], [txn('1', 'A', 'New', 100, { gross_premium: 120 }), txn('2', 'A', 'Endorsement', 10, { gross_premium: 12, reversed: true })]).A).toBe(120);
});
test('blank when no file supplied it, but a real zero stays zero', () => {
  const g = gross([policy('A'), policy('B')], [txn('1', 'A', 'New', 100), txn('2', 'B', 'New', 0, { gross_premium: 0 })]);
  expect(g.A).toBeNull();
  expect(g.B).toBe(0);
});
test('does not change what is owed', () => {
  const m = buildModel({ policies: [policy('A')], txns: [txn('1', 'A', 'New', 100, { gross_premium: 120 })], receipts: [{ id: 'r', policy_id: 'A', amount: 100, type: 'Receipt' }], commissions: [], claims: [] }, DEFAULT_CONFIG, '2026-11-04');
  expect(m.policies[0].outstanding).toBe(0);
  expect(m.policies[0].pay_status).toBe('Paid');
});
