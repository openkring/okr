import { describe, it, expect } from 'vitest';
import { propertyTypeOf } from '@okr/shared-util-core';
import { Field } from '@okr/shared-models';
import { getPrefillFields, PROPERTY_FIELD_TEMPLATES } from './form-field-templates';

describe('getPrefillFields', () => {
  it('returns the curated field set for applications.default', () => {
    const fields = getPrefillFields('applications.default');
    expect(fields.length).toBeGreaterThan(0);
    const keys = fields.map(f => f.key);
    expect(keys).toEqual([
      'firstName', 'lastName', 'gender', 'dateOfBirth', 'ssnId', 'email', 'phone',
      'streetName', 'streetNumber', 'zipCode', 'city', 'countryCode', 'applicationAs', 'courseKey',
    ]);
  });

  it('offers the course choice on both application mappings, audience from applicationAs', () => {
    for (const mappingKey of ['applications.default', 'applications.junior']) {
      const course = getPrefillFields(mappingKey).find(f => f.key === 'courseKey');
      expect(course?.type).toBe('course');
      expect(course?.label).toBe('Kurs');
      expect(course && 'audienceFrom' in course ? course.audienceFrom : undefined).toBe('applicationAs');
    }
    expect(getPrefillFields('applications.course').some(f => f.type === 'course')).toBe(false);
  });

  it('returns the course set for applications.course with an implicit courseId', () => {
    const fields = getPrefillFields('applications.course');
    expect(fields.map(f => f.key)).toEqual([
      'courseId', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'email', 'phone',
      'streetName', 'streetNumber', 'zipCode', 'city',
    ]);
    const course = fields.find(f => f.key === 'courseId');
    // first, so a rule of any later field can depend on the course
    expect(course?.order).toBe(0);
    expect(course?.type).toBe('implicit');
    expect(course?.label).toBe('Kurs');
    expect(course?.asProperty).toBe(true);
    expect(course && 'valueType' in course ? course.valueType : undefined).toBe('text');
    expect(fields.some(f => f.type === 'ssn')).toBe(false);
  });

  it('asks for the AHV number with an ssn field in both application mappings', () => {
    for (const mappingKey of ['applications.default', 'applications.junior']) {
      const ssn = getPrefillFields(mappingKey).find(f => f.key === 'ssnId');
      expect(ssn?.type).toBe('ssn');
      expect(ssn?.label).toBe('AHV-Nummer');
      expect(ssn?.asProperty).toBeUndefined();
    }
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
    expect(afterFirestoreClone.fields).toHaveLength(14);
    expect(afterFirestoreClone.fields[0].key).toBe('firstName');
  });
});

describe('PROPERTY_FIELD_TEMPLATES', () => {
  it('offers a text, a yes/no and a number question', () => {
    const types = PROPERTY_FIELD_TEMPLATES.map(t => ({ type: t.type, property: propertyTypeOf({ type: t.type } as Field) }));
    expect(types).toEqual([
      { type: 'text', property: 'text' },
      { type: 'checkbox', property: 'boolean' },
      { type: 'number', property: 'number' },
    ]);
  });
});
