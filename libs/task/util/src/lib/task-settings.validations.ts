import { enforce, only, staticSuite, test } from 'vest';

import { isInteger } from '@okr/shared-util-core';

/**
 * spec 1.72 §8.2/§9 — the two task settings on `AppConfig`. Deliberately NOT the shared
 * base-model shape (no `okey`/`tenants`/`tags`): this is a plain settings patch, not a
 * Firestore model. Defined here (not in `shared-models`) so `shared-data-access` does not
 * have to import `@okr/task-util` — `AppConfigService.setTaskSettings` types its parameter
 * inline as `Pick<AppConfig, 'taskArchiveDays' | 'taskDiaryTenantId'>`, the same shape.
 */
export type TaskSettings = {
  taskArchiveDays: number;
  taskDiaryTenantId: string;
};

/** Days after completion until a task is archived automatically; 0..3650, 0 = never. */
const TASK_ARCHIVE_DAYS_MAX = 3650;

export const taskSettingsValidations = staticSuite((model: TaskSettings, field?: string) => {
  if (field) only(field);

  test('taskArchiveDays', 'taskArchiveDaysRange', () => {
    enforce(model.taskArchiveDays).isNumber().greaterThanOrEquals(0).lessThanOrEquals(TASK_ARCHIVE_DAYS_MAX);
  });

  test('taskArchiveDays', 'taskArchiveDaysInteger', () => {
    enforce(isInteger(model.taskArchiveDays)).isTruthy();
  });

  // taskDiaryTenantId: a selector value (a tenant id, or '' for "no diary") — no length cap,
  // membership in the catalogue is enforced by the select, not by this suite (building-forms rule 1).
});
