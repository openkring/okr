import { describe, expect, it } from 'vitest';
import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel } from './person-new-form.model';
import { PersonDuplicateCandidate } from './person-duplicate.model';
import { computePersonFieldDiffs } from './person-field-diff.util';

function candidate(overrides: Partial<PersonDuplicateCandidate> = {}): PersonDuplicateCandidate {
  return {
    bkey: 'p1', firstName: 'Anna', lastName: 'Muster', gender: 'female',
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
    const diffs = computePersonFieldDiffs(candidate({ dateOfBirth: '' }), form({ dateOfBirth: '1990-04-02' }));
    expect(diffs).toEqual([{ field: 'dateOfBirth', existingValue: '', newValue: '1990-04-02' }]);
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
});
