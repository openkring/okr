import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SchedulePollFormData } from './schedule-poll.model';

/**
 * Creating a poll writes columns x (members + 1) documents in ONE Firestore batch, and a batch is
 * capped at 500 writes. 10 columns keeps that batch under the cap for any group up to 49 members
 * (10 x 50 = 500) — and a poll with more than 10 date proposals is unusable in a table anyway.
 */
export const MAX_SCHEDULE_POLL_COLUMNS = 10;

/**
 * Only the draft phase validates anything: once the poll is live the columns are frozen and the
 * member is merely toggling cells, which can never be invalid.
 */
export const schedulePollValidations = staticSuite((model: SchedulePollFormData, field?: string) => {
  if (field) only(field);

  omitWhen(!model.isDraft, () => {
    // bare key: ErrorNote resolves it as 'validation.<key>' in the main bundle
    test('name', 'schedulePollNameMandatory', () => {
      enforce(model.name).isNotEmpty();
    });
    test('columns', 'schedulePollColumnsMandatory', () => {
      enforce(model.columns.length).greaterThan(0);
    });
    test('columns', 'schedulePollColumnsMax', () => {
      enforce(model.columns.length).lessThanOrEquals(MAX_SCHEDULE_POLL_COLUMNS);
    });
  });
});
