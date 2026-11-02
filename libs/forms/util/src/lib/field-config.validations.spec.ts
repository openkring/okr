import { describe, expect, it } from 'vitest';
import { Field } from '@okr/shared-models';
import { fieldConfigValidations, fieldLabelLength } from './field-config.validations';

const base = { id: 'f1', key: 'firstName', label: 'Vorname', required: false, width: 'full' as const, order: 0 };

describe('fieldConfigValidations', () => {
  it('accepts a complete text field', () => {
    expect(fieldConfigValidations({ ...base, type: 'text' } as Field).isValid()).toBe(true);
  });

  it('requires label and key on an input field', () => {
    const result = fieldConfigValidations({ ...base, type: 'text', label: '', key: '' } as Field);
    expect(result.getErrors('label')).toContain('required');
    expect(result.getErrors('key')).toContain('required');
  });

  it('accepts camelCase keys only', () => {
    for (const key of ['1st', 'first name', 'a-b', 'first_name', 'FirstName', '_x1']) {
      expect(fieldConfigValidations({ ...base, type: 'text', key } as Field).hasErrors('key')).toBe(true);
    }
    for (const key of ['firstName', 'email', 'address2']) {
      expect(fieldConfigValidations({ ...base, type: 'text', key } as Field).hasErrors('key')).toBe(false);
    }
  });

  it('needs no key on display elements and no label on a divider', () => {
    expect(fieldConfigValidations({ ...base, type: 'divider', label: '', key: '' } as Field).isValid()).toBe(true);
    expect(fieldConfigValidations({ ...base, type: 'label', label: 'Hinweis', key: '' } as Field).isValid()).toBe(true);
    expect(fieldConfigValidations({ ...base, type: 'label', label: '', key: '' } as Field).hasErrors('label')).toBe(true);
  });

  it('requires a category on a category field', () => {
    expect(fieldConfigValidations({ ...base, type: 'category', categoryName: '' } as Field).hasErrors('categoryName')).toBe(true);
    expect(fieldConfigValidations({ ...base, type: 'category', categoryName: 'gender' } as Field).isValid()).toBe(true);
  });

  it('requires the text of a paragraph but no key', () => {
    expect(fieldConfigValidations({ ...base, type: 'paragraph', label: 'Bitte beachten…', key: '' } as Field).isValid()).toBe(true);
    expect(fieldConfigValidations({ ...base, type: 'paragraph', label: '', key: '' } as Field).hasErrors('label')).toBe(true);
  });

  it('allows prose length for the text of a label or paragraph element only', () => {
    expect(fieldLabelLength({ type: 'label' })).toBeGreaterThan(fieldLabelLength({ type: 'text' }));
    expect(fieldLabelLength({ type: 'paragraph' })).toBe(fieldLabelLength({ type: 'label' }));
  });

  it('validates a «Nur anzeigen, wenn …» rule under visibleIf', () => {
    const ok = { ...base, type: 'text', visibleIf: { match: 'all', conditions: [{ fieldId: 'f0', op: 'equals', value: 'x' }] } } as Field;
    expect(fieldConfigValidations(ok).isValid()).toBe(true);

    const noValue = { ...base, type: 'text', visibleIf: { match: 'all', conditions: [{ fieldId: 'f0', op: 'equals' }] } } as Field;
    expect(fieldConfigValidations(noValue).hasErrors('visibleIf.conditions.0.value')).toBe(true);

    const noField = { ...base, type: 'divider', key: '', label: '', visibleIf: { match: 'any', conditions: [{ fieldId: '', op: 'isFilled' }] } } as Field;
    expect(fieldConfigValidations(noField).hasErrors('visibleIf.conditions.0.fieldId')).toBe(true);

    const empty = { ...base, type: 'text', visibleIf: { match: 'all', conditions: [] } } as unknown as Field;
    expect(fieldConfigValidations(empty).hasErrors('visibleIf.conditions')).toBe(true);
  });

  it('checks no rule when none is set', () => {
    const result = fieldConfigValidations({ ...base, type: 'text' } as Field);
    expect(Object.keys(result.getErrors()).some(k => k.startsWith('visibleIf'))).toBe(false);
  });

  describe('implicit field (spec §8.1)', () => {
    const implicit = (extra: Record<string, unknown> = {}) => ({ ...base, key: 'courseId', type: 'implicit', valueType: 'text', ...extra }) as Field;

    it('accepts a typed implicit field with and without a default value', () => {
      expect(fieldConfigValidations(implicit()).isValid()).toBe(true);
      expect(fieldConfigValidations(implicit({ defaultValue: 'skiff-1' })).isValid()).toBe(true);
      expect(fieldConfigValidations(implicit({ valueType: 'number', defaultValue: 3 })).isValid()).toBe(true);
      expect(fieldConfigValidations(implicit({ valueType: 'number', defaultValue: '3' })).isValid()).toBe(true);
      expect(fieldConfigValidations(implicit({ valueType: 'boolean', defaultValue: true })).isValid()).toBe(true);
    });

    it('requires the type of the value', () => {
      expect(fieldConfigValidations(implicit({ valueType: undefined })).hasErrors('valueType')).toBe(true);
      expect(fieldConfigValidations(implicit({ valueType: 'date' })).hasErrors('valueType')).toBe(true);
    });

    it('rejects a default value that does not coerce to the type', () => {
      expect(fieldConfigValidations(implicit({ valueType: 'number', defaultValue: 'abc' })).getErrors('defaultValue')).toContain('@forms/feature.field.default_invalid');
      expect(fieldConfigValidations(implicit({ valueType: 'boolean', defaultValue: 'maybe' })).hasErrors('defaultValue')).toBe(true);
    });

    it('treats an empty default value as none', () => {
      expect(fieldConfigValidations(implicit({ valueType: 'number', defaultValue: '' })).isValid()).toBe(true);
    });

    it('R1: rejects an implicit field that is an AHV field (key ssnId)', () => {
      const result = fieldConfigValidations(implicit({ key: 'ssnId', defaultValue: '7561234567897' }));
      expect(result.getErrors('key')).toContain('@forms/feature.fields.implicit_ssn');
      expect(fieldConfigValidations(implicit({ key: 'courseId' })).hasErrors('key')).toBe(false);
    });

    it('checks no value type on other fields', () => {
      expect(fieldConfigValidations({ ...base, type: 'text' } as Field).hasErrors('valueType')).toBe(false);
    });
  });

  describe('allowOther (spec §9)', () => {
    const opts = [{ label: 'A', value: 'a' }];
    const radio = (extra: Record<string, unknown> = {}) => ({ ...base, key: 'kurs', type: 'radio', options: opts, ...extra }) as Field;

    it('accepts it on dropdown, radio and checkbox with options', () => {
      expect(fieldConfigValidations(radio({ allowOther: true })).isValid()).toBe(true);
      expect(fieldConfigValidations({ ...base, key: 'k', type: 'dropdown', options: opts, allowOther: true } as Field).isValid()).toBe(true);
      expect(fieldConfigValidations({ ...base, key: 'k', type: 'checkbox', options: opts, allowOther: true } as Field).isValid()).toBe(true);
    });

    it('rejects it on a single checkbox', () => {
      expect(fieldConfigValidations({ ...base, key: 'k', type: 'checkbox', allowOther: true } as Field).getErrors('allowOther'))
        .toContain('@forms/feature.field.allow_other_blocked');
    });

    it('rejects it on a typed choice key of the mapping and on an AHV key', () => {
      const gender = radio({ key: 'gender', allowOther: true });
      expect(fieldConfigValidations(gender, 'applications.default').hasErrors('allowOther')).toBe(true);
      expect(fieldConfigValidations(gender).hasErrors('allowOther')).toBe(false);
      expect(fieldConfigValidations(radio({ key: 'ssnId', allowOther: true })).hasErrors('allowOther')).toBe(true);
    });

    it('does not check it when switched off', () => {
      expect(fieldConfigValidations(radio({ key: 'gender', allowOther: false }), 'applications.default').hasErrors('allowOther')).toBe(false);
    });
  });
});
