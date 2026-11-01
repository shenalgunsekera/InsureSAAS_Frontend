import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BancaPage from './BancaPage';

jest.mock('../App', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@x.com' }, userProfile: { role: 'admin', full_name: 'Admin' }, hasAccess: () => true }) }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../storage', () => ({ uploadFile: jest.fn(), openFile: jest.fn() }));
jest.mock('recharts', () => { const P = ({ children }) => <div>{children}</div>; return new Proxy({}, { get: () => P }); });
const DATA = {
  policies: [{ id: 'P1', policy_no: 'VM-1', customer: 'A', insurer: 'Ceylinco', branch: 'Colombo', class: 'Motor', inception: '2026-09-05', expiry: '2027-09-04', facility_no: '0413241100680', vehicle_no: 'WPYN3576', pay_type: 'In-house', sum_insured: 950000 }],
  txns: [{ id: 'T1', policy_id: 'P1', type: 'New', effective_date: '2026-09-05', gwp_month: '2026-09', basic: 100000, srcc: 10000, tc: 5000, total: 115000, comm_basic: 17000, comm_srcc: 500, comm_tc: 250, comm_total: 17750, gross_premium: 140000, remarks: 'DONE', batch_id: 'B1' }],
  receipts: [], commissions: [], claims: [], batches: [{ id: 'B1', register: 'gwp', status: 'Posted', file_name: 'x.xlsx', uploaded_at: '2026-10-01T00:00:00Z', stats: { accepted: 1 } }],
  files: [], exceptions: [], statements: [], pmf_payments: [], approvals: [], targets: [], signoffs: [],
};
jest.mock('firebase/firestore', () => ({
  collection: (db, p) => ({ p }), doc: (db, ...p) => ({ p: p.join('/'), id: 'NEW' }), query: (c) => c, orderBy: () => null, limit: () => null,
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async (c) => { const k = String(c.p || '').split('/').pop(); return { docs: (global.__DATA[k] || []).map(d => ({ id: d.id, data: () => d })) }; },
  setDoc: jest.fn(), updateDoc: jest.fn(), writeBatch: () => ({ set: jest.fn(), update: jest.fn(), commit: jest.fn() }),
}));
global.__DATA = DATA;

const SECTIONS = ['master', 'gwp', 'payments', 'commission', 'renewals', 'commission-tracker', 'outstanding', 'expired', 'split', 'lib-gwp', 'lib-payment', 'lib-commission', 'claims',
  'dashboard', 'upload', 'batches', 'exceptions', 'reconciliation', 'statements', 'approvals', 'lib-pmf', 'lib-claims', 'targets', 'fields', 'settings', 'audit',
  'p-dr', 'p-ca', 'p-issue', 'p-incident', 'p-release', 'p-training', 'p-improvement', 'p-dev'];

for (const s of SECTIONS) {
  test(`renders ${s}`, async () => {
    const errors = []; const orig = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    render(<MemoryRouter initialEntries={[`/banca/bank/${s}`]}><Routes><Route path="/banca/:bankId/:section?" element={<BancaPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(/InsureSAAS Banca/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull(), { timeout: 4000 });
    console.error = orig;
    const real = errors.filter(e => !/act\(|ReactDOMTestUtils|not wrapped|validateDOMNesting|Each child|unique "key"|findDOMNode/.test(e));
    if (real.length) throw new Error(real.join('\n').slice(0, 1500));
  });
}
