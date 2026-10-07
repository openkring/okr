import { describe, expect, it } from 'vitest';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { newTemplatePublishFormModel, templatePublishValidations } from './template-publish.validations';

describe('templatePublishValidations', () => {
  it('rejects an empty changelog', () => {
    const result = templatePublishValidations(newTemplatePublishFormModel());
    expect(result.hasErrors('changelog')).toBe(true);
  });

  it('rejects a blank changelog', () => {
    expect(templatePublishValidations({ changelog: '   ' }).hasErrors('changelog')).toBe(true);
  });

  it('accepts a changelog', () => {
    expect(templatePublishValidations({ changelog: 'Logo ersetzt' }).isValid()).toBe(true);
  });

  it('rejects a changelog longer than DESCRIPTION_LENGTH', () => {
    expect(templatePublishValidations({ changelog: 'x'.repeat(DESCRIPTION_LENGTH + 1) }).hasErrors('changelog')).toBe(true);
  });
});
