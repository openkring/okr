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
});
