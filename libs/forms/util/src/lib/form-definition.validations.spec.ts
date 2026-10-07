import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { FormDefinitionModel } from '@okr/shared-models';

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
});
