import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { Field, FormDefinitionModel } from '@okr/shared-models';

import { formDefinitionValidations } from './form-definition.validations';

function newDefinition(overrides: Partial<FormDefinitionModel> = {}): FormDefinitionModel {
  const fd = new FormDefinitionModel('test');
  fd.name = 'Kontaktformular';
  fd.target = { kind: 'collection', mappingKey: 'applications', modelType: 'person', collectionName: 'applications' };
  return { ...fd, ...overrides };
}

describe('formDefinitionValidations', () => {
  it('accepts a named form with a collection target', () => {
    expect(formDefinitionValidations(newDefinition()).isValid()).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(formDefinitionValidations(newDefinition({ name: '  ' })).hasErrors('name')).toBe(true);
  });

  it('rejects a name longer than LONG_NAME_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ name: 'x'.repeat(LONG_NAME_LENGTH + 1) })).hasErrors('name')).toBe(true);
  });

  it('accepts an empty description but rejects one longer than DESCRIPTION_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ description: '' })).isValid()).toBe(true);
    expect(formDefinitionValidations(newDefinition({ description: 'x'.repeat(DESCRIPTION_LENGTH + 1) })).hasErrors('description')).toBe(true);
  });

  it('accepts an empty or missing filler help text but rejects one longer than DESCRIPTION_LENGTH', () => {
    expect(formDefinitionValidations(newDefinition({ fillerHelpText: '' })).isValid()).toBe(true);
    expect(formDefinitionValidations({ ...newDefinition(), fillerHelpText: undefined } as unknown as FormDefinitionModel).isValid()).toBe(true);
    expect(formDefinitionValidations(newDefinition({ fillerHelpText: 'x'.repeat(DESCRIPTION_LENGTH + 1) })).hasErrors('fillerHelpText')).toBe(true);
  });

  it('rejects a collection target without a mapping', () => {
    const fd = newDefinition({ target: { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' } });
    expect(formDefinitionValidations(fd).hasErrors('target.mappingKey')).toBe(true);
  });

  it('rejects a URL target with a blank URL', () => {
    const fd = newDefinition({ target: { kind: 'url', url: ' ' } });
    expect(formDefinitionValidations(fd).hasErrors('target.url')).toBe(true);
  });

  it('accepts a URL target with a URL', () => {
    const fd = newDefinition({ target: { kind: 'url', url: 'https://example.com/hook' } });
    expect(formDefinitionValidations(fd).isValid()).toBe(true);
  });

  it('does not require a mapping for a URL target', () => {
    const fd = newDefinition({ target: { kind: 'url', url: 'https://example.com/hook' } });
    expect(formDefinitionValidations(fd).hasErrors('target.mappingKey')).toBe(false);
  });

  describe('unique field keys (spec 7.3)', () => {
    const field = (id: string, type: string, key: string, order: number) => ({ id, key, type, label: id, required: false, width: 'full', order }) as Field;

    it('rejects two input fields with the same key', () => {
      const fd = newDefinition({ fields: [field('a', 'radio', 'field_11', 0), field('b', 'checkbox', 'field_11', 1)] });
      const result = formDefinitionValidations(fd);
      expect(result.hasErrors('fields')).toBe(true);
      expect(result.getErrors('fields')).toContain('@forms/feature.fields.duplicate_key');
    });

    it('accepts distinct keys', () => {
      const fd = newDefinition({ fields: [field('a', 'text', 'firstName', 0), field('b', 'text', 'lastName', 1)] });
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });

    it('accepts duplicate empty keys on dividers and other display elements', () => {
      const fd = newDefinition({ fields: [field('a', 'divider', '', 0), field('b', 'divider', '', 1), field('c', 'label', '', 2), field('d', 'text', 'x', 3)] });
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });

    it('does not report fields with an empty key as duplicates of each other', () => {
      const fd = newDefinition({ fields: [field('a', 'text', '', 0), field('b', 'text', '', 1)] });
      expect(formDefinitionValidations(fd).hasErrors('fields')).toBe(false);
    });

    it('survives a legacy definition without a field list', () => {
      const fd = newDefinition();
      (fd as { fields?: Field[] }).fields = undefined;
      expect(formDefinitionValidations(fd).isValid()).toBe(true);
    });
  });
});
