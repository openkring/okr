import { describe, it, expect } from 'vitest';
import { getPrefillFields } from './form-field-templates';

describe('getPrefillFields', () => {
  it('returns the curated field set for applications.default', () => {
    const fields = getPrefillFields('applications.default');
    expect(fields.length).toBeGreaterThan(0);
    const keys = fields.map(f => f.key);
    expect(keys).toEqual([
      'firstName', 'lastName', 'gender', 'dateOfBirth', 'email', 'phone',
      'streetName', 'streetNumber', 'zipCode', 'city', 'countryCode', 'applicationAs',
    ]);
  });

  it('assigns sequential order and full width to every field', () => {
    const fields = getPrefillFields('applications.default');
    fields.forEach((f, i) => {
      expect(f.order).toBe(i);
      expect(f.width).toBe('full');
    });
  });

  it('generates a unique id per field', () => {
    const fields = getPrefillFields('applications.default');
    const ids = new Set(fields.map(f => f.id));
    expect(ids.size).toBe(fields.length);
  });

  it('maps types and required flags correctly', () => {
    const fields = getPrefillFields('applications.default');
    const byKey = Object.fromEntries(fields.map(f => [f.key, f]));
    expect(byKey['email'].type).toBe('email');
    expect(byKey['email'].required).toBe(true);
    expect(byKey['phone'].type).toBe('phone');
    expect(byKey['phone'].required).toBe(false);
    expect(byKey['dateOfBirth'].type).toBe('date');
  });

  it('expands radio fields with their options', () => {
    const fields = getPrefillFields('applications.default');
    const gender = fields.find(f => f.key === 'gender');
    expect(gender?.type).toBe('radio');
    const options = gender?.type === 'radio' ? gender.options : [];
    expect(options.map(o => o.value)).toEqual(['male', 'female']);
  });

  it('returns an empty array for an unknown mapping key', () => {
    expect(getPrefillFields('does.not.exist')).toEqual([]);
  });

  it('survives the create-path structuredClone (modal clone + Firestore write)', () => {
    // Mirrors the runtime path: openCreateModal assigns the prefill to the model,
    // the edit modal deep-clones it (safeStructuredClone), and createModel clones
    // again before setDoc. Fields must survive both clones intact.
    const model = { fields: getPrefillFields('applications.default') };
    const afterModalClone = structuredClone(model);
    const afterFirestoreClone = structuredClone(afterModalClone);
    expect(afterFirestoreClone.fields).toHaveLength(12);
    expect(afterFirestoreClone.fields[0].key).toBe('firstName');
  });
});
