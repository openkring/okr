import { describe, expect, it } from 'vitest';

import { categoryNamesOfFields, projectPublicCategories, projectPublicFormDefinition } from './public-definition';

const FIELDS = [
  { id: 'a', key: 'dateOfBirth', type: 'date', label: 'Geburtsdatum', required: true, width: 'full', order: 0 },
  {
    id: 'b', key: 'guardian', type: 'text', label: 'Erziehungsberechtigte', required: true, width: 'full', order: 1,
    asProperty: true, visibleIf: { mode: 'all', conditions: [{ fieldId: 'a', op: 'ageLt', value: 20 }] },
  },
];

describe('projectPublicFormDefinition', () => {
  const doc = {
    tenants: ['scs'], isArchived: false, name: 'Anmeldung', description: 'd', fillerHelpText: 'So füllst du es aus.',
    formKey: 'f1', honeypotKey: 'hp', encryptionSalt: 'salt', encryptionKeyHash: 'SECRET', pdfTemplateId: '',
    target: { kind: 'collection', mappingKey: 'applications', modelType: 'person', collectionName: 'applications' },
    fields: FIELDS, derivedValues: [{ key: 'applicationAs', cases: [] }], version: 3,
    createdBy: 'uid-1', createdAt: '20261028',
  };

  it('passes the author help text for the filler', () => {
    expect(projectPublicFormDefinition('d1', doc, 'f1', 'scs')['fillerHelpText']).toBe('So füllst du es aus.');
  });

  it('defaults a missing help text to empty (legacy documents)', () => {
    const { fillerHelpText: _omit, ...legacy } = doc;
    expect(projectPublicFormDefinition('d1', legacy, 'f1', 'scs')['fillerHelpText']).toBe('');
  });

  it('keeps the fields as stored, visibility rules and asProperty included', () => {
    const fields = projectPublicFormDefinition('d1', doc, 'f1', 'scs')['fields'] as typeof FIELDS;
    expect(fields).toEqual(FIELDS);
    expect(fields[1].visibleIf).toBeDefined();
    expect(fields[1].asProperty).toBe(true);
  });

  it('projects sendFillerConfirmation, default false (legacy documents)', () => {
    expect(projectPublicFormDefinition('d1', { ...doc, sendFillerConfirmation: true }, 'f1', 'scs')['sendFillerConfirmation']).toBe(true);
    expect(projectPublicFormDefinition('d1', doc, 'f1', 'scs')['sendFillerConfirmation']).toBe(false);
    expect(projectPublicFormDefinition('d1', { ...doc, sendFillerConfirmation: 'yes' }, 'f1', 'scs')['sendFillerConfirmation']).toBe(false);
  });

  it('never exposes the thank-you texts: they may quote answers and are returned only after a submit', () => {
    const out = projectPublicFormDefinition('d1', {
      ...doc, confirmationMessage: 'Danke {firstName}', confirmationVariants: [{ when: { mode: 'all', conditions: [] }, message: 'x' }],
    }, 'f1', 'scs');
    expect(out).not.toHaveProperty('confirmationMessage');
    expect(out).not.toHaveProperty('confirmationVariants');
  });

  it('never exposes the key hash, audit data or derived values', () => {
    const out = projectPublicFormDefinition('d1', doc, 'f1', 'scs');
    expect(out).not.toHaveProperty('encryptionKeyHash');
    expect(out).not.toHaveProperty('createdBy');
    expect(out).not.toHaveProperty('derivedValues');
    expect(out['okey']).toBe('d1');
  });
});

describe('categoryNamesOfFields', () => {
  it('lists each category field\'s list once, in form order', () => {
    const fields = [
      { type: 'category', categoryName: 'gender' }, { type: 'text', categoryName: 'ignored' },
      { type: 'category', categoryName: 'boat' }, { type: 'category', categoryName: 'gender' }, { type: 'category' },
    ];
    expect(categoryNamesOfFields(fields)).toEqual(['gender', 'boat']);
  });

  it('reads garbage as no fields', () => {
    expect(categoryNamesOfFields(undefined)).toEqual([]);
    expect(categoryNamesOfFields('x')).toEqual([]);
  });
});

describe('projectPublicCategories', () => {
  const system = { name: 'gender', tenants: ['system', 'scs'], items: [{ name: 'male', abbreviation: 'M', icon: 'male' }, { name: 'female', abbreviation: 'F' }] };

  it('returns the item keys only, in the asked order', () => {
    expect(projectPublicCategories([system], ['gender'], 'scs')).toEqual([
      { name: 'gender', items: [{ name: 'male', abbreviation: 'M' }, { name: 'female', abbreviation: 'F' }] },
    ]);
  });

  it('prefers the tenant\'s own list over the shared system list', () => {
    const own = { name: 'gender', tenants: ['scs'], items: [{ name: 'other' }] };
    expect(projectPublicCategories([{ ...system, tenants: ['system'] }, own], ['gender'], 'scs')[0].items)
      .toEqual([{ name: 'other', abbreviation: '' }]);
  });

  it('never serves another tenant\'s list or an archived one', () => {
    const foreign = { name: 'gender', tenants: ['p13'], items: [{ name: 'x' }] };
    const archived = { ...system, isArchived: true };
    expect(projectPublicCategories([foreign, archived], ['gender'], 'scs')).toEqual([]);
  });
});
