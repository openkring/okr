import { describe, expect, it } from 'vitest';
import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel } from './person-new-form.model';
import { PersonDuplicateCandidate } from './person-duplicate.model';
import { computePersonFieldDiffs } from './person-field-diff.util';

function candidate(overrides: Partial<PersonDuplicateCandidate> = {}): PersonDuplicateCandidate {
  return {
    okey: 'p1', firstName: 'Anna', lastName: 'Muster', gender: 'female',
    dateOfBirth: '', dateOfDeath: '', ssnId: '', favEmail: '', favPhone: '',
    favZipCode: '', bexioId: '', tenants: ['t1'], ...overrides,
  };
}
function form(overrides: Partial<PersonNewFormModel> = {}): PersonNewFormModel {
  return { ...PERSON_NEW_FORM_SHAPE, firstName: 'Anna', lastName: 'Muster', gender: 'female', ...overrides };
}

describe('computePersonFieldDiffs', () => {
  it('returns no diffs when form matches the existing person', () => {
    expect(computePersonFieldDiffs(candidate(), form())).toEqual([]);
  });

  it('reports a diff when the form adds a value the existing person lacks', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '' }), form({ dateOfBirth: '19900402' }));
    expect(diffs).toEqual([{ field: 'dateOfBirth', existingValue: '', newValue: '19900402' }]);
  });

  it('reports a diff when values differ, mapping email/phone/zip to fav fields', () => {
    const diffs = computePersonFieldDiffs(
      candidate({ favEmail: 'a@x.ch', favPhone: '111', favZipCode: '8000' }),
      form({ email: 'a@y.ch', phone: '111', zipCode: '8001' }),
    );
    expect(diffs).toEqual([
      { field: 'favEmail', existingValue: 'a@x.ch', newValue: 'a@y.ch' },
      { field: 'favZipCode', existingValue: '8000', newValue: '8001' },
    ]);
  });

  it('ignores empty form values (never proposes wiping existing data)', () => {
    const diffs = computePersonFieldDiffs(candidate({ ssnId: '756.1234.5678.90' }), form({ ssnId: '' }));
    expect(diffs).toEqual([]);
  });

  it('treats whitespace-only differences as equal', () => {
    const diffs = computePersonFieldDiffs(candidate({ favEmail: 'a@x.ch' }), form({ email: '  a@x.ch  ' }));
    expect(diffs).toEqual([]);
  });

  it('does not propose overwriting a full birth date with a year-only entry of the same year', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '19850415' }), form({ dateOfBirth: '19850000' }));
    expect(diffs.find(d => d.field === 'dateOfBirth')).toBeUndefined();
  });

  it('does not propose overwriting a full birth date with a matching birthday', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '19850415' }), form({ dateOfBirth: '00000415' }));
    expect(diffs.find(d => d.field === 'dateOfBirth')).toBeUndefined();
  });

  it('still proposes a diff when the years genuinely disagree', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '19850415' }), form({ dateOfBirth: '19860000' }));
    expect(diffs.find(d => d.field === 'dateOfBirth')).toBeDefined();
  });

  it('still proposes a diff when the existing person has no birth date', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '' }), form({ dateOfBirth: '19850000' }));
    expect(diffs.find(d => d.field === 'dateOfBirth')).toBeDefined();
  });

  it('applies the same rule to dateOfDeath', () => {
    const diffs = computePersonFieldDiffs(candidate({ dateOfDeath: '20200101' }), form({ dateOfDeath: '20200000' }));
    expect(diffs.find(d => d.field === 'dateOfDeath')).toBeUndefined();
  });

  it('leaves non-date fields comparing as plain strings', () => {
    const diffs = computePersonFieldDiffs(candidate({ firstName: 'Anna' }), form({ firstName: 'Anne' }));
    expect(diffs.find(d => d.field === 'firstName')).toBeDefined();
  });
});
