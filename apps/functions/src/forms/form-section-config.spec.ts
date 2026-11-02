import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import { readVerifiedSection, verifySectionForForm } from './form-section-config';

const SECTION = {
  type: 'form',
  tenants: ['scs'],
  properties: { formKey: 'f1', implicitValues: { courseId: 'c1' }, maxResponses: 8, emailAddresses: ['a@b.ch'] },
};

/** A minimal fake of `db.collection('sections').doc(id).get()`. */
function fakeDb(docs: Record<string, Record<string, unknown>>): Firestore {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = name === 'sections' ? docs[id] : undefined;
          return { id, exists: data !== undefined, data: () => data };
        },
      }),
    }),
  } as unknown as Firestore;
}

describe('verifySectionForForm', () => {
  it('returns the properties of a form section of this form and tenant', () => {
    expect(verifySectionForForm('s1', SECTION, 'f1', 'scs')).toEqual(SECTION.properties);
  });

  it('ignores a section of another form', () => {
    expect(verifySectionForForm('s1', SECTION, 'f2', 'scs')).toBeUndefined();
  });

  it('ignores a section of another tenant', () => {
    expect(verifySectionForForm('s1', SECTION, 'f1', 'kring')).toBeUndefined();
  });

  it('ignores a missing document', () => {
    expect(verifySectionForForm('s1', undefined, 'f1', 'scs')).toBeUndefined();
  });

  it('ignores a section that is no form section, or has no properties', () => {
    expect(verifySectionForForm('s1', { ...SECTION, type: 'article' }, 'f1', 'scs')).toBeUndefined();
    expect(verifySectionForForm('s1', { type: 'form', tenants: ['scs'] }, 'f1', 'scs')).toBeUndefined();
  });

  it('ignores an empty id', () => {
    expect(verifySectionForForm('', SECTION, 'f1', 'scs')).toBeUndefined();
  });
});

describe('readVerifiedSection', () => {
  const db = fakeDb({ s1: SECTION });

  it('reads and verifies the section', async () => {
    expect(await readVerifiedSection(db, 's1', 'f1', 'scs')).toEqual({ id: 's1', props: SECTION.properties });
  });

  it('a forged reference (other form, other tenant, unknown id) yields nothing', async () => {
    expect(await readVerifiedSection(db, 's1', 'f2', 'scs')).toBeUndefined();
    expect(await readVerifiedSection(db, 's1', 'f1', 'kring')).toBeUndefined();
    expect(await readVerifiedSection(db, 'nope', 'f1', 'scs')).toBeUndefined();
  });

  it('no reference, or one that is no document id, is not read at all', async () => {
    expect(await readVerifiedSection(db, undefined, 'f1', 'scs')).toBeUndefined();
    expect(await readVerifiedSection(db, '', 'f1', 'scs')).toBeUndefined();
    expect(await readVerifiedSection(db, 'sections/s1', 'f1', 'scs')).toBeUndefined();
    expect(await readVerifiedSection(db, 42 as unknown as string, 'f1', 'scs')).toBeUndefined();
  });
});
