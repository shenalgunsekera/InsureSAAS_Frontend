// Vehicle Reg No + Facility No on every tracker: the grid, the Excel export and the PDF export.
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BancaPage from './BancaPage';
import { BANKS } from './core';

jest.mock('../App', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@x.com' }, userProfile: { role: 'admin', full_name: 'Admin' }, hasAccess: () => true }) }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../storage', () => ({ uploadFile: jest.fn(), openFile: jest.fn() }));
jest.mock('recharts', () => { const P = ({ children }) => <div>{children}</div>; return new Proxy({}, { get: () => P }); });
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('exceljs', () => ({ __esModule: true, default: { Workbook: class {
  constructor() { this.xlsx = { writeBuffer: async () => new ArrayBuffer(1) }; }
  addWorksheet(name) {
    const rows = []; if (name === 'Detail') global.__SHEET = rows;
    const any = () => ({ eachCell: () => {} });
    return { addRow: (a) => { rows.push(a); return {}; }, getRow: any, getColumn: () => ({}), get rowCount() { return rows.length; } };
  }
} } }));
jest.mock('jspdf', () => ({ __esModule: true, default: class {
  constructor() { this.internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 }, getNumberOfPages: () => 1 }; return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) }); }
} }));
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: (pdf, opts) => { global.__PDF = opts; } }));

const ymd = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const txn = (id, policy_id, at) => ({ id, policy_id, type: 'New', effective_date: at, gwp_month: at.slice(0, 7), basic: 100000, srcc: 10000, tc: 5000, total: 115000, gross_premium: 139090.25, comm_basic: 17000, comm_srcc: 500, comm_tc: 250, comm_total: 17750 });
global.__DATA = {
  policies: [
    { id: 'P1', policy_no: 'VM-1', customer: 'A', insurer: 'X', branch: 'Colombo', class: 'Motor', inception: ymd(-335), expiry: ymd(30), vehicle_no: 'WPYN3576', facility_no: '0413241100680' },
    { id: 'P2', policy_no: 'VM-2', customer: 'B', insurer: 'X', branch: 'Kandy', class: 'Motor', inception: ymd(-400), expiry: ymd(-35), vehicle_no: 'CAB9911', facility_no: '0999000111222' },
  ],
  txns: [txn('T1', 'P1', ymd(-335)), txn('T2', 'P2', ymd(-400))],
  claims: [{ id: 'C1', claim_ref: 'CL-1', policy_id: 'P1', policy_no: 'VM-1', customer: 'A', insurer: 'X', estimate: 5000, status: 'Open' },
    { id: 'C2', claim_ref: 'CL-2', policy_no: 'UNKNOWN', customer: 'Z', insurer: 'X', estimate: 100, status: 'Open' }],
};
jest.mock('firebase/firestore', () => ({
  collection: (db, p) => ({ p }), doc: (db, ...p) => ({ p: p.join('/'), id: 'NEW' }), query: (c) => c, orderBy: () => null, limit: () => null,
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async (c) => { const k = String(c.p || '').split('/').pop(); return { docs: (global.__DATA[k] || []).map(d => ({ id: d.id, data: () => d })) }; },
  setDoc: jest.fn(), updateDoc: jest.fn(), writeBatch: () => ({ set: jest.fn(), update: jest.fn(), commit: jest.fn() }),
}));
beforeAll(() => { global.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror()); } }; });

const BANK = Object.keys(BANKS)[0];
const open = async (s) => {
  render(<MemoryRouter initialEntries={[`/banca/${BANK}/${s}`]}><Routes><Route path="/banca/:bankId/:section?" element={<BancaPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Vehicle Reg No')).toBeTruthy());
};
// tracker → a policy that is on it
const P1 = ['WPYN3576', '0413241100680'];
const TRACKERS = { renewals: P1, 'commission-tracker': P1, outstanding: P1, expired: ['CAB9911', '0999000111222'], split: P1, claims: P1 };

for (const [s, [veh, fac]] of Object.entries(TRACKERS)) {
  test(`${s}: both columns right after Policy No, with the policy's numbers`, async () => {
    await open(s);
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    const i = heads.indexOf('Policy No');
    expect(heads.slice(i, i + 3)).toEqual(['Policy No', 'Vehicle Reg No', 'Facility No']);
    expect(screen.getByText(veh)).toBeTruthy();
    expect(screen.getByText(fac)).toBeTruthy();
  });
  test(`${s}: Excel export has both, facility no kept as text with its zeros`, async () => {
    global.__SHEET = null;
    await open(s);
    fireEvent.click(screen.getByText('Excel'));
    await waitFor(() => expect(global.__SHEET && global.__SHEET.length).toBeGreaterThan(1));
    const [head, ...rows] = global.__SHEET; const v = head.indexOf('Vehicle Reg No'), f = head.indexOf('Facility No');
    expect(v).toBeGreaterThan(-1); expect(f).toBe(v + 1);
    const row = rows.find(r => r[v] === veh);
    expect(row[f]).toBe(fac);
  });
  test(`${s}: PDF export keeps both and cuts off no column`, async () => {
    global.__PDF = null;
    await open(s);
    const grid = screen.getAllByRole('columnheader').map(h => h.textContent).filter(Boolean);
    fireEvent.click(screen.getByText('PDF'));
    await waitFor(() => expect(global.__PDF).toBeTruthy());
    const head = global.__PDF.head[0];
    expect(head).toEqual(expect.arrayContaining(['Vehicle Reg No', 'Facility No']));
    expect(head).toEqual(grid);
  });
}

test('search finds a policy by vehicle number and by facility number', async () => {
  await open('outstanding');
  const box = screen.getByPlaceholderText(/search/i);
  fireEvent.change(box, { target: { value: 'cab9911' } });
  await waitFor(() => { expect(screen.getByText('CAB9911')).toBeTruthy(); expect(screen.queryByText('WPYN3576')).toBeNull(); });
  fireEvent.change(box, { target: { value: '041324' } });
  await waitFor(() => { expect(screen.getByText('WPYN3576')).toBeTruthy(); expect(screen.queryByText('CAB9911')).toBeNull(); });
});
test('a claim with no linked policy shows blanks, not an error', async () => {
  await open('claims');
  expect(screen.getByText('CL-2')).toBeTruthy();
});
