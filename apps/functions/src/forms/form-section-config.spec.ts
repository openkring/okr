import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

import type { Field } from '@okr/shared-models';
import { computeFormAvailability } from '@okr/shared-util-core';

import { acceptanceForSection, readVerifiedSection, requiresSection, verifySectionForForm } from './form-section-config';

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

const implicit = (extra: Record<string, unknown> = {}): Field =>
  ({ id: 'c', key: 'courseId', type: 'implicit', label: 'Kurs', valueType: 'text', required: false, width: 'full', order: 0, ...extra }) as Field;
const text = { id: 'n', key: 'firstName', type: 'text', label: 'Vorname', required: false, width: 'full', order: 1 } as Field;

describe('requiresSection', () => {
  it('an implicit field without default and without fromLink needs the page', () => {
    expect(requiresSection([implicit(), text])).toBe(true);
    expect(requiresSection([implicit({ defaultValue: '' })])).toBe(true);
  });

  it('a default or fromLink can supply the value: no section needed', () => {
    expect(requiresSection([implicit({ defaultValue: 'c1' })])).toBe(false);
    expect(requiresSection([implicit({ fromLink: true })])).toBe(false);
  });

  it('a form without implicit fields, or a legacy one without fields, needs none', () => {
    expect(requiresSection([text])).toBe(false);
    expect(requiresSection(undefined)).toBe(false);
  });
});

describe('acceptanceForSection', () => {
  const db = fakeDb({ s1: SECTION });
  const courseForm = { okey: 'd1', fields: [implicit(), text], maxResponses: 0 };

  it('a form that needs a section is closed when the reference is forged or absent', async () => {
    for (const [ref, formKey] of [['s1', 'f2'], ['nope', 'f1'], [undefined, 'f1'], ['', 'f1']] as const) {
      const section = await readVerifiedSection(db, ref, formKey, 'scs');
      const availability = computeFormAvailability(acceptanceForSection(courseForm, section), 0, '20261102');
      expect(availability).toMatchObject({ isOpen: false, reason: 'closed' });
    }
  });

  it('the same form on its verified section is open, with the section limit and counter', async () => {
    const section = await readVerifiedSection(db, 's1', 'f1', 'scs');
    const settings = acceptanceForSection(courseForm, section);
    expect(settings).toMatchObject({ isOpen: true, maxResponses: 8, statsId: 'd1__s1' });
  });

  it('a form without such implicit fields still works without a section', () => {
    const settings = acceptanceForSection({ okey: 'd1', fields: [text, implicit({ defaultValue: 'c1' })] }, undefined);
    expect(computeFormAvailability(settings, 0, '20261102').isOpen).toBe(true);
  });
});
