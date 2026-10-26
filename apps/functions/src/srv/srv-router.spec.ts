import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: (n: string) => ({ name: n, value: () => 'x' }) }));

import { SRV_OPS, SRV_OPTIONS, srv } from './srv-router';
import * as contact from './contact';

const NAMES = ['getSrvContacts', 'getSrvMemberDetail', 'createSrvContact', 'updateSrvContact'];

describe('srv op table', () => {
  it('has exactly the 4 op names as keys', () => {
    expect(Object.keys(SRV_OPS).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name}: the op is the handler its alias wraps`, () => {
      const handler = 'handle' + name[0].toUpperCase() + name.slice(1);
      const mod = contact as Record<string, unknown>;
      expect(SRV_OPS[name]).toBe(mod[handler]);
      expect(typeof (mod[name] as { run: unknown }).run).toBe('function');
    });
  }

  it('uses the router options from the consolidation spec', () => {
    expect(SRV_OPTIONS).toEqual({ cors: true, region: 'europe-west6', enforceAppCheck: true, secrets: expect.any(Array) });
    expect(SRV_OPTIONS.secrets.map((s: { name: string }) => s.name)).toEqual(['REGASOFT_APIKEY', 'REGASOFT_CLUBID']);
  });

  it('an unknown op is invalid-argument', async () => {
    await expect(srv.run({ auth: { uid: 'u1' }, app: {}, data: { op: 'nope' } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('an unauthenticated op is rejected by the handler body', async () => {
    await expect(srv.run({ app: {}, data: { op: 'getSrvContacts' } } as never)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
