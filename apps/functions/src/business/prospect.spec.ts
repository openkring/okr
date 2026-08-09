import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
// vi.mock is hoisted above this import, so `createProspect` sees the stub.
import { createProspect } from './prospect';

/**
 * C5 §2/§4/§5 — the three properties that must survive every front door reaching `createProspect`
 * (the `submitProspect` callable today, the form builder's `prospects.*` mapping since 1.30):
 *
 *  1. no consent → no record. It is the legal basis, and the notice it belongs to states the
 *     onward transfer to a partner; a lead stored without it could never lawfully be passed on.
 *  2. the contact details land in the address vault under `parentKey = 'prospect.<okey>'`, and
 *     NEVER as a loose field on the prospect — that is the whole reason the builder's one-document
 *     path is not used here.
 *  3. the e-mail is lowercased on the way in. `subject-data-map.ts` reaches a prospect by an
 *     equality query on that address, so a stored `Ann@Example.CH` would be invisible to export
 *     and would survive erasure silently.
 */

interface Write { collection: string; id?: string; data: Record<string, unknown> }
const writes: Write[] = [];

vi.mock('firebase-admin/firestore', () => {
  class FakeDoc {
    constructor(private readonly root: string, public readonly id: string) {}
    async set(data: Record<string, unknown>) { writes.push({ collection: this.root, id: this.id, data }); }
  }
  class FakeCollection {
    constructor(private readonly root: string) {}
    doc(id = 'PROSPECT-1') { return new FakeDoc(this.root, id); }
    async add(data: Record<string, unknown>) { writes.push({ collection: this.root, data }); return { id: 'ADDR-1' }; }
  }
  return { getFirestore: () => ({ collection: (root: string) => new FakeCollection(root) }) };
});

const SIGNUP = { name: 'Turnverein Musterhausen', contactName: 'Ann Müller', email: 'Ann@Example.CH', consent: true };

const written = (collection: string) => writes.filter((w) => w.collection === collection);

describe('createProspect', () => {
  beforeEach(() => { writes.length = 0; });

  it('refuses a submission without consent, and writes nothing at all', async () => {
    await expect(createProspect({ ...SIGNUP, consent: false })).rejects.toThrow(HttpsError);
    await expect(createProspect({ name: SIGNUP.name, email: SIGNUP.email })).rejects.toThrow(HttpsError);
    expect(writes).toHaveLength(0);
  });

  it("accepts the string 'true' — a form builder checkbox may arrive either way", async () => {
    await createProspect({ ...SIGNUP, consent: 'true' });
    expect(written('prospects')).toHaveLength(1);
  });

  it('requires a name and an e-mail', async () => {
    await expect(createProspect({ ...SIGNUP, name: '  ' })).rejects.toThrow(HttpsError);
    await expect(createProspect({ ...SIGNUP, email: '' })).rejects.toThrow(HttpsError);
    expect(writes).toHaveLength(0);
  });

  it('keeps the contact details in the vault, lowercased, and off the prospect record', async () => {
    const okey = await createProspect({ ...SIGNUP, phone: '+41 79 111 22 33', segment: 'coop', source: 'kring.ch' });

    const prospect = written('prospects')[0];
    expect(prospect.id).toBe(okey);
    expect(prospect.data).toMatchObject({ name: SIGNUP.name, contactName: 'Ann Müller', segment: 'coop', status: 'open', source: 'kring.ch' });
    expect(prospect.data['consentAt']).toBeTruthy();
    expect(Object.keys(prospect.data)).not.toContain('email');
    expect(Object.keys(prospect.data)).not.toContain('phone');

    const addresses = written('addresses');
    expect(addresses).toHaveLength(2);
    expect(addresses.map((a) => a.data['parentKey'])).toEqual([`prospect.${okey}`, `prospect.${okey}`]);
    expect(addresses[0].data).toMatchObject({ addressChannel: 'email', email: 'ann@example.ch', isFavorite: true });
    expect(addresses[1].data).toMatchObject({ addressChannel: 'phone', phone: '+41 79 111 22 33' });
  });

  it('writes no phone address when the optional field was left empty', async () => {
    await createProspect({ ...SIGNUP, phone: '' });
    expect(written('addresses')).toHaveLength(1);
  });

  it('drops a non-string value instead of stringifying it into the vault', async () => {
    await createProspect({ ...SIGNUP, phone: { nested: 'object' } });
    expect(written('addresses')).toHaveLength(1);
  });
});
