import { describe, expect, it } from 'vitest';
import type { Field } from '@okr/shared-models';
import {
  choiceByName,
  isFixableField,
  isModelSelect,
  matchModelChoices,
  modelChoiceName,
  modelSelectKeyOf,
  projectModelChoices,
  resolveFixedValues,
  sanitizeModelSelectAnswers,
} from './form-model-select.util';

const base = { id: 'f1', label: 'L', required: false, width: 'full' as const, order: 0 };
const org = (extra: Record<string, unknown> = {}): Field => ({ ...base, key: 'previousClub', type: 'org', filter: 'club', ...extra }) as Field;
const person = (extra: Record<string, unknown> = {}): Field => ({ ...base, id: 'p', key: 'coach', type: 'person', ...extra }) as Field;

describe('isModelSelect / modelSelectKeyOf', () => {
  it('knows the three pickers', () => {
    expect(isModelSelect({ type: 'person' })).toBe(true);
    expect(isModelSelect({ type: 'org' })).toBe(true);
    expect(isModelSelect({ type: 'resource' })).toBe(true);
    expect(isModelSelect({ type: 'avatar' })).toBe(false);
    expect(isModelSelect(undefined)).toBe(false);
  });
  it('appends Key', () => {
    expect(modelSelectKeyOf({ key: 'previousClub' })).toBe('previousClubKey');
  });
});

describe('modelChoiceName', () => {
  it('joins a person name and trims an org name', () => {
    expect(modelChoiceName('person', { firstName: ' Anna ', lastName: 'Muster' })).toBe('Anna Muster');
    expect(modelChoiceName('person', { lastName: 'Muster' })).toBe('Muster');
    expect(modelChoiceName('org', { name: ' Seeclub Zürich ' })).toBe('Seeclub Zürich');
    expect(modelChoiceName('resource', {})).toBe('');
  });
});

describe('projectModelChoices', () => {
  const docs = [
    { okey: 'c2', name: 'Ruderclub Thalwil', type: 'club', tenants: ['scs'] },
    { okey: 'c1', name: 'Belvoir', type: 'club', tenants: ['scs'] },
    { okey: 'a1', name: 'Verband', type: 'association', tenants: ['scs'] },
    { okey: 'x1', name: 'Other tenant', type: 'club', tenants: ['bkg'] },
    { okey: 'z1', name: 'Archived', type: 'club', tenants: ['scs'], isArchived: true },
    { okey: 'n1', name: '', type: 'club', tenants: ['scs'] },
    { okey: 'c1', name: 'Duplicate', type: 'club', tenants: ['scs'] },
  ];
  it('keeps the tenant\'s live records of the filter type, sorted by name, each once', () => {
    expect(projectModelChoices({ type: 'org', filter: 'club' }, docs, 'scs')).toEqual([
      { key: 'c1', name: 'Belvoir' },
      { key: 'c2', name: 'Ruderclub Thalwil' },
    ]);
  });
  it('lists every type without a filter', () => {
    expect(projectModelChoices({ type: 'org', filter: '' }, docs, 'scs').map(c => c.key)).toEqual(['c1', 'c2', 'a1']);
  });
});

describe('matchModelChoices / choiceByName', () => {
  const choices = [{ key: 'a', name: 'Seeclub Zürich' }, { key: 'b', name: 'Ruderclub Zürich' }, { key: 'c', name: 'Belvoir' }];
  it('matches case- and accent-insensitively, none for a blank query', () => {
    expect(matchModelChoices(choices, 'zuri').map(c => c.key)).toEqual(['a', 'b']);
    expect(matchModelChoices(choices, '  ')).toEqual([]);
    expect(matchModelChoices(choices, 'club', 1)).toHaveLength(1);
  });
  it('finds one exact name only', () => {
    expect(choiceByName(choices, ' belvoir ')?.key).toBe('c');
    expect(choiceByName(choices, 'Bel')).toBeUndefined();
    expect(choiceByName([...choices, { key: 'd', name: 'Belvoir' }], 'Belvoir')).toBeUndefined();
    expect(choiceByName(choices, 3)).toBeUndefined();
  });
});

describe('sanitizeModelSelectAnswers', () => {
  const clubs = { previousClub: [{ key: 'c1', name: 'Belvoir' }] };

  it('keeps a listed key and takes the record\'s name', () => {
    const r = sanitizeModelSelectAnswers([org()], { previousClub: 'belvoir', previousClubKey: 'c1' }, clubs);
    expect(r.values).toEqual({ previousClub: 'Belvoir', previousClubKey: 'c1' });
    expect(r.refused).toEqual([]);
  });

  it('drops an unlisted key and keeps free text when allowed', () => {
    const r = sanitizeModelSelectAnswers([org({ allowCustom: true })], { previousClub: 'RC Basel', previousClubKey: 'forged' }, clubs);
    expect(r.values).toEqual({ previousClub: 'RC Basel' });
    expect(r.refused).toEqual([]);
  });

  it('picks the key of a name typed exactly', () => {
    const r = sanitizeModelSelectAnswers([org()], { previousClub: 'Belvoir' }, clubs);
    expect(r.values['previousClubKey']).toBe('c1');
  });

  it('refuses an unlisted name without free text', () => {
    const r = sanitizeModelSelectAnswers([org({ allowCustom: false })], { previousClub: 'RC Basel' }, clubs);
    expect(r.refused).toEqual(['previousClub']);
  });

  it('takes a typed person name without a list (anonymous filler), and drops a sent key', () => {
    const r = sanitizeModelSelectAnswers([person()], { coach: 'Anna Muster', coachKey: 'p1' }, {});
    expect(r.values).toEqual({ coach: 'Anna Muster' });
    expect(r.refused).toEqual([]);
  });

  it('leaves a real field that owns <key>Key alone', () => {
    const owner = { ...base, id: 'o', key: 'previousClubKey', type: 'text' } as Field;
    const r = sanitizeModelSelectAnswers([org({ allowCustom: true }), owner], { previousClub: 'X', previousClubKey: 'typed' }, clubs);
    expect(r.values['previousClubKey']).toBe('typed');
  });

  it('ignores an empty answer', () => {
    const r = sanitizeModelSelectAnswers([org()], { previousClub: '', previousClubKey: 'c1' }, clubs);
    expect(r.values).toEqual({ previousClub: '' });
    expect(r.refused).toEqual([]);
  });
});

describe('resolveFixedValues', () => {
  const fields = [
    { ...base, id: 'a', key: 'topic', type: 'category', categoryName: 'contact_topic' },
    { ...base, id: 'b', key: 'kind', type: 'radio', options: [{ label: 'A', value: 'a' }] },
    { ...base, id: 'c', key: 'name', type: 'text' },
  ] as Field[];

  it('keeps only fixable fields with a fitting, non-blank value', () => {
    expect(resolveFixedValues(fields, { topic: 'junior', kind: 'x', name: 'Eve', unknown: 'y' })).toEqual({ topic: 'junior' });
    expect(resolveFixedValues(fields, { kind: 'a', topic: ' ' })).toEqual({ kind: 'a' });
    expect(resolveFixedValues(fields, undefined)).toEqual({});
    expect(resolveFixedValues(fields, { topic: 'x'.repeat(501) })).toEqual({});
  });

  it('knows the fixable types', () => {
    expect(isFixableField({ type: 'dropdown' })).toBe(true);
    expect(isFixableField({ type: 'text' })).toBe(false);
  });
});
