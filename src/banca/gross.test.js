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
const owed = (txns, amount) => buildModel({ policies: [policy('A')], txns, receipts: amount ? [{ id: 'r', policy_id: 'A', amount, type: 'Receipt' }] : [], commissions: [], claims: [] }, DEFAULT_CONFIG, '2026-11-04').policies[0];
test('what is owed is the premium incl. taxes', () => {
  const t = [txn('1', 'A', 'New', 100, { gross_premium: 120 })];
  expect(owed(t).outstanding).toBe(120);
  expect(owed(t).pay_status).toBe('Unpaid');
  expect(owed(t, 100).outstanding).toBe(20);
  expect(owed(t, 100).pay_status).toBe('Part paid');
  expect(owed(t, 120).pay_status).toBe('Paid');
  expect(owed(t, 130).pay_status).toBe('Overpaid');
});
test('falls back to Total Premium, row by row, where a file gave no taxes figure', () => {
  expect(owed([txn('1', 'A', 'New', 100)]).outstanding).toBe(100);
  expect(owed([txn('1', 'A', 'New', 100, { gross_premium: 120 }), txn('2', 'A', 'Endorsement', 10)]).outstanding).toBe(130);
});
test('a cancellation with taxes reduces what is owed', () => {
  expect(owed([txn('1', 'A', 'New', 100, { gross_premium: 120 }), txn('2', 'A', 'Cancellation', -70, { gross_premium: -84 })], 36).pay_status).toBe('Paid');
});
