import { describe, expect, it } from 'vitest';

import type { AvatarInfo } from '@okr/shared-models';

import { buildSubmissionRecord, buildSubmissionTask } from './submission-record';

const input = {
  values: { firstName: 'Anna', lastName: 'Muster', zipCode: '8712', city: 'Stäfa', applicationAs: 'youth' },
  defaults: { state: 'applied', source: 'form', applicationFor: 'membership' },
  collectionName: 'applications',
  tenantId: 'scs',
  submittedAt: '2026-11-25T10:00:00.000Z',
  formKey: 'mitgliedschaft-beantragen',
  spamReasons: [] as string[],
};

/** Firestore refuses a document with an `undefined` anywhere (ignoreUndefinedProperties is not set). */
function undefinedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] === undefined);
}

describe('buildSubmissionRecord', () => {
  it('holds no undefined value for a real submission (Firestore would refuse the write)', () => {
    const record = buildSubmissionRecord(input);
    expect(undefinedKeys(record)).toEqual([]);
    expect(record).not.toHaveProperty('spamReasons');
    expect(record['isSpam']).toBe(false);
  });

  it('keeps the answers, the mapping defaults and the server fields', () => {
    expect(buildSubmissionRecord(input)).toMatchObject({
      firstName: 'Anna', state: 'applied', applicationFor: 'membership', tenants: ['scs'],
      submittedAt: '2026-11-25T10:00:00.000Z', formKey: 'mitgliedschaft-beantragen',
    });
  });

  it('is found by the applications list (isArchived == false) and its search (index)', () => {
    const record = buildSubmissionRecord(input);
    expect(record['isArchived']).toBe(false);
    expect(record['index']).toBe('fn:Anna n:Muster z:8712 c:Stäfa k:youth s:applied');
  });

  it('builds the index from missing and non-text answers without "undefined"', () => {
    const record = buildSubmissionRecord({ ...input, values: { lastName: 'Muster', city: 12 } });
    expect(record['index']).toBe('n:Muster s:applied');
  });

  it('stores spam with its reasons, outside the list', () => {
    const record = buildSubmissionRecord({ ...input, spamReasons: ['honeypot'] });
    expect(record).toMatchObject({ isSpam: true, spamReasons: ['honeypot'], isArchived: true });
    expect(undefinedKeys(record)).toEqual([]);
  });

  it('lets no answer override a server field', () => {
    const values = { ...input.values, isArchived: true, tenants: ['p13'], index: 'x', isSpam: true, state: 'closed.approved' };
    expect(buildSubmissionRecord({ ...input, values })).toMatchObject({
      isArchived: false, tenants: ['scs'], isSpam: false, state: 'applied',
      index: 'fn:Anna n:Muster z:8712 c:Stäfa k:youth s:applied',
    });
  });

  it('drops an undefined answer', () => {
    const record = buildSubmissionRecord({ ...input, values: { ...input.values, phone: undefined } });
    expect(record).not.toHaveProperty('phone');
  });

  it('sets no application index on another collection', () => {
    expect(buildSubmissionRecord({ ...input, collectionName: 'other' })).not.toHaveProperty('index');
  });
});

describe('buildSubmissionTask', () => {
  const assignee = { key: 'p1', name1: 'Erika', name2: 'Beispiel', modelType: 'person', type: 'female', subType: '', label: 'Erika Beispiel' } as AvatarInfo;
  const task = buildSubmissionTask({ tenantId: 'scs', formName: 'Anmeldung', assignee, notes: '{}' });

  it('has the shape the task list and board read (tags as text, a known state)', () => {
    expect(task).toMatchObject({
      name: 'Anmeldung – Formulareinreichung', tags: 'form.submission', state: 'initial',
      priority: 'medium', importance: 'medium', isArchived: false, tenants: ['scs'], notes: '{}', assignee,
      completionDate: '',
    });
    expect(task['index']).toContain('ask:p1');
  });

  it('holds neither an undefined value nor the document id', () => {
    expect(undefinedKeys(task)).toEqual([]);
    expect(task).not.toHaveProperty('okey');
  });
});
