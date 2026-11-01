// Upload Fields: reordering columns (arrows + drag and drop), saving, reset, view-only.
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setDoc } from 'firebase/firestore';
import BancaPage from './BancaPage';
import { TEMPLATES } from './templates';

let mockRole = 'admin';
jest.mock('../App', () => ({ useAuth: () => ({ user: { uid: 'u1', email: 'a@x.com' }, userProfile: { role: mockRole, full_name: 'Admin' }, hasAccess: () => true }) }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../storage', () => ({ uploadFile: jest.fn(), openFile: jest.fn() }));
jest.mock('recharts', () => { const P = ({ children }) => <div>{children}</div>; return new Proxy({}, { get: () => P }); });
jest.mock('firebase/firestore', () => ({
  collection: (db, p) => ({ p }), doc: (db, ...p) => ({ p: p.join('/'), id: 'NEW' }), query: (c) => c, orderBy: () => null, limit: () => null,
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async () => ({ docs: [] }),
  setDoc: jest.fn(async () => {}), updateDoc: jest.fn(), writeBatch: () => ({ set: jest.fn(), update: jest.fn(), commit: jest.fn() }),
}));

const GWP = TEMPLATES.gwp.cols.map(c => c.key);
const rowKeys = () => screen.getAllByTestId(/^row-/).map(r => r.getAttribute('data-testid').slice(4));
async function openGwp() {
  render(<MemoryRouter initialEntries={['/banca/bank/fields']}><Routes><Route path="/banca/:bankId/:section?" element={<BancaPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getAllByText('GWP & Endorsements').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText('GWP & Endorsements').find(el => el.closest('.MuiChip-root')));
  await waitFor(() => expect(screen.getByText(/Standard columns — GWP & Endorsements/)).toBeTruthy());
}
const configSaves = () => setDoc.mock.calls.filter(([ref]) => ref.p === 'banca/bank');
beforeEach(() => { setDoc.mockClear(); mockRole = 'admin'; });

test('default order = template order', async () => {
  await openGwp();
  expect(rowKeys()).toEqual(GWP);
});

test('arrows move a column; save writes the full order and replaces the setting whole', async () => {
  await openGwp();
  fireEvent.click(screen.getByLabelText('Move policy_no down'));
  expect(rowKeys().slice(0, 2)).toEqual(['prev_policy_no', 'policy_no']);
  expect(screen.getByLabelText('Move prev_policy_no up').disabled).toBe(true);       // first row can't go up
  expect(screen.getByLabelText(`Move ${GWP[GWP.length - 1]} down`).disabled).toBe(true); // last row can't go down
  fireEvent.click(screen.getByText('Save fields'));
  await waitFor(() => expect(configSaves().length).toBe(1));
  const [, data, opts] = configSaves()[0];
  expect(data.fields.gwp.order).toEqual(['prev_policy_no', 'policy_no', ...GWP.slice(2)]);
  expect(opts.mergeFields).toEqual(expect.arrayContaining(['fields', 'updated_at', 'updated_by']));
  expect(opts.merge).toBeUndefined();
});

test('drag and drop moves a row (only when grabbed by the handle)', async () => {
  await openGwp();
  const row = (k) => screen.getByTestId(`row-${k}`);
  // dragging without grabbing the handle: row isn't draggable
  expect(row('basic').getAttribute('draggable')).toBe('false');
  fireEvent.mouseDown(screen.getByTestId('drag-basic'));
  expect(row('basic').getAttribute('draggable')).toBe('true');
  fireEvent.dragStart(row('basic'), { dataTransfer: { setData: () => {}, effectAllowed: '' } });
  fireEvent.dragOver(row('policy_no'), { dataTransfer: {} });
  fireEvent.drop(row('policy_no'), { dataTransfer: {} });
  expect(rowKeys().slice(0, 2)).toEqual(['basic', 'policy_no']);
  expect(rowKeys().length).toBe(GWP.length);
  expect(row('basic').getAttribute('draggable')).toBe('false');                // disarmed after the drop
  // pressing the handle and releasing without dragging disarms too
  fireEvent.mouseDown(screen.getByTestId('drag-srcc'));
  fireEvent.mouseUp(window);
  expect(row('srcc').getAttribute('draggable')).toBe('false');
});

test('reset order and discard', async () => {
  await openGwp();
  fireEvent.click(screen.getByLabelText('Move customer up'));
  expect(rowKeys()).not.toEqual(GWP);
  fireEvent.click(screen.getByText('Reset order'));
  expect(rowKeys()).toEqual(GWP);
  expect(screen.queryByText('Reset order')).toBeNull();
  fireEvent.click(screen.getByLabelText('Move customer up'));
  fireEvent.click(screen.getByText('Discard'));
  expect(rowKeys()).toEqual(GWP);
});

test('order is per upload type', async () => {
  await openGwp();
  fireEvent.click(screen.getByLabelText('Move policy_no down'));
  fireEvent.click(screen.getAllByText('Premium Payments & Refunds').find(el => el.closest('.MuiChip-root')));
  expect(rowKeys()).toEqual(TEMPLATES.payments.cols.map(c => c.key));
});

test('custom fields appear in the order list and can be moved', async () => {
  await openGwp();
  fireEvent.click(screen.getByText('Add field'));
  const name = screen.getAllByLabelText('Field name').pop();
  fireEvent.change(name, { target: { value: 'Loan Ref' } });
  expect(rowKeys()[rowKeys().length - 1]).toBe('cf:loan_ref');
  fireEvent.click(screen.getByLabelText('Move cf:loan_ref up'));
  expect(rowKeys()[rowKeys().length - 2]).toBe('cf:loan_ref');
  const r = screen.getByTestId('row-cf:loan_ref');
  expect(within(r).getByText('Loan Ref')).toBeTruthy();
});

test('view-only users get no reorder controls', async () => {
  mockRole = 'manager';
  await openGwp();
  expect(screen.queryByLabelText('Move policy_no down')).toBeNull();
  expect(screen.queryByTestId('drag-policy_no')).toBeNull();
  expect(screen.getByTestId('row-policy_no').getAttribute('draggable')).toBe('false');
});
