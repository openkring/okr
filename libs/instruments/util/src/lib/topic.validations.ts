import { only, staticSuite } from 'vest';

import { LONG_NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { InstrumentTopic } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/**
 * A topic card is not an OkrModel (no okey/tenants), so it does not run `baseValidations`. Only the
 * label is mandatory; description is optional.
 */
export const topicValidations = staticSuite((model: InstrumentTopic, field?: string) => {
  if (field) only(field);

  stringValidations('label', model.label, SHORT_NAME_LENGTH, 1, true);
  stringValidations('description', model.description, LONG_NAME_LENGTH);
});
