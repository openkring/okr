import { create, enforce, test } from 'vest';

import { ResponsibilityConfig } from '@bk2/shared-models';

export const responsibilitySectionValidations = create((data: ResponsibilityConfig) => {
  test('bkey', 'validation.required', () => {
    enforce(data.bkey).isNotEmpty();
  });
});
