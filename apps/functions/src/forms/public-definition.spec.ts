import { describe, expect, it } from 'vitest';

import { projectPublicFormDefinition } from './public-definition';

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

  it('never exposes the key hash, audit data or derived values', () => {
    const out = projectPublicFormDefinition('d1', doc, 'f1', 'scs');
    expect(out).not.toHaveProperty('encryptionKeyHash');
    expect(out).not.toHaveProperty('createdBy');
    expect(out).not.toHaveProperty('derivedValues');
    expect(out['okey']).toBe('d1');
  });
});
