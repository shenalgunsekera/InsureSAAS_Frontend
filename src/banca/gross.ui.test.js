// Premium incl. Taxes shows on the Master Register, Renewal Tracker and Outstanding Tracker.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BancaPage from './BancaPage';
import { BANKS } from './core';

jest.mock('../App', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@x.com' }, userProfile: { role: 'admin', full_name: 'Admin' }, hasAccess: () => true }) }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../storage', () => ({ uploadFile: jest.fn(), openFile: jest.fn() }));
jest.mock('recharts', () => { const P = ({ children }) => <div>{children}</div>; return new Proxy({}, { get: () => P }); });
const ymd = (days) => { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
global.__DATA = {
  // expires in 30 days and nothing is paid, so it is on all three grids
  policies: [{ id: 'P1', policy_no: 'VM-1', customer: 'A', insurer: 'X', branch: 'Colombo', class: 'Motor', inception: ymd(-335), expiry: ymd(30) }],
  txns: [{ id: 'T1', policy_id: 'P1', type: 'New', effective_date: ymd(-335), gwp_month: ymd(-335).slice(0, 7), basic: 100000, srcc: 10000, tc: 5000, total: 115000, gross_premium: 139090.25 }],
};
jest.mock('firebase/firestore', () => ({
  collection: (db, p) => ({ p }), doc: (db, ...p) => ({ p: p.join('/'), id: 'NEW' }), query: (c) => c, orderBy: () => null, limit: () => null,
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async (c) => { const k = String(c.p || '').split('/').pop(); return { docs: (global.__DATA[k] || []).map(d => ({ id: d.id, data: () => d })) }; },
  setDoc: jest.fn(), updateDoc: jest.fn(), writeBatch: () => ({ set: jest.fn(), update: jest.fn(), commit: jest.fn() }),
}));

const BANK = Object.keys(BANKS)[0];
for (const s of ['master', 'renewals', 'outstanding']) {
  test(`${s} shows the column, the policy's figure and the total`, async () => {
    render(<MemoryRouter initialEntries={[`/banca/${BANK}/${s}`]}><Routes><Route path="/banca/:bankId/:section?" element={<BancaPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Premium incl. Taxes')).toBeTruthy());
    expect(screen.getAllByText('139,090.25').length).toBe(2); // the row + the footer total
  });
}
