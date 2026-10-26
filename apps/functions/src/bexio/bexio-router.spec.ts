import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'x' }) }));

import { BEXIO_OPS, BEXIO_OPTIONS, bexio } from './bexio-router';
import * as contact from './contact';
import * as invoice from './invoice';
import * as bill from './bill';
import * as journal from './journal';
import * as account from './account';

const NAMES = [
  'getBexioContacts', 'createBexioContact', 'updateBexioContact', 'createBexioInvoice', 'showInvoicePdf', 'showBillPdf',
  'syncBexioInvoices', 'syncBexioBills', 'syncBexioJournal', 'syncBexioAccounts',
];
const OP_ONLY = ['syncBexioInvoices', 'syncBexioBills', 'syncBexioJournal', 'syncBexioAccounts'];
const modules: Record<string, unknown>[] = [contact, invoice, bill, journal, account];

describe('bexio op table', () => {
  it('has exactly the 10 op names as keys', () => {
    expect(Object.keys(BEXIO_OPS).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name}: the op is the handler its alias wraps`, () => {
      const handler = 'handle' + name[0].toUpperCase() + name.slice(1);
      const owner = modules.find((m) => handler in m);
      expect(owner, `${handler} exported`).toBeDefined();
      expect(BEXIO_OPS[name]).toBe(owner![handler]);
      if (OP_ONLY.includes(name)) expect(owner![name]).toBeUndefined();
      else expect(typeof (owner![name] as { run: unknown }).run).toBe('function');
    });
  }

  it('uses the router options from the consolidation spec', () => {
    expect(BEXIO_OPTIONS).toEqual({
      cors: true,
      region: 'europe-west6',
      enforceAppCheck: true,
      memory: '1GiB',
      timeoutSeconds: 540,
      secrets: [expect.anything(), expect.anything(), expect.anything(), expect.anything()],
    });
  });

  it('an unknown op is invalid-argument', async () => {
    await expect(bexio.run({ auth: { uid: 'u1' }, app: {}, data: { op: 'nope' } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
