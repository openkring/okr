import { create, enforce, test } from 'vest';

import { ResponsibilityConfig } from '@okr/shared-models';

export const responsibilitySectionValidations = create((data: ResponsibilityConfig) => {
  test('bkey', 'required', () => {
    enforce(data.bkey).isNotEmpty();
  });
});
