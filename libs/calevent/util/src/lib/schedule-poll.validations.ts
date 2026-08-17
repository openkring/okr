import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { SchedulePollFormData } from './schedule-poll.model';

/**
 * Only the draft phase validates anything: once the poll is live the columns are frozen and the
 * member is merely toggling cells, which can never be invalid.
 */
export const schedulePollValidations = staticSuite((model: SchedulePollFormData, field?: string) => {
  if (field) only(field);

  omitWhen(!model.isDraft, () => {
    stringValidations('name', model.name, SHORT_NAME_LENGTH);
    // bare key: ErrorNote resolves it as 'validation.<key>' in the main bundle
    test('name', 'schedulePollNameMandatory', () => {
      enforce(model.name).isNotEmpty();
    });
    test('columns', 'schedulePollColumnsMandatory', () => {
      enforce(model.columns.length).greaterThan(0);
    });
  });
});
