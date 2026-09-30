import { enforce, only, staticSuite, test } from 'vest';

import { isInteger } from '@okr/shared-util-core';

import { TASK_I18N_KEYS } from './task-i18n';

/**
 * spec 1.72 §8.2/§9 — the two task settings on `AppConfig`. Deliberately NOT the shared
 * base-model shape (no `okey`/`tenants`/`tags`): this is a plain settings patch, not a
 * Firestore model. Defined here (not in `shared-models`) so `shared-data-access` does not
 * have to import `@okr/task-util` — `AppConfigService.setTaskSettings` types its parameter
 * inline as `Pick<AppConfig, 'taskArchiveDays' | 'diaryTenantId'>`, the same shape.
 */
export type TaskSettings = {
  taskArchiveDays: number;
  diaryTenantId: string;
};

/**
 * Days after completion until a task is archived automatically; 0..3650, 0 = never. Exported
 * (not a private local) so `TaskSettingsForm`'s `[min]`/`[max]` bind to the SAME constant this
 * suite enforces, rather than a copied literal (building-forms rule 2).
 */
export const TASK_ARCHIVE_DAYS_MIN = 0;
export const TASK_ARCHIVE_DAYS_MAX = 3650;

export const taskSettingsValidations = staticSuite((model: TaskSettings, field?: string) => {
  if (field) only(field);

  // Messages are '@'-prefixed scoped i18n keys (TASK_I18N_KEYS.validations_*), not bare Vest
  // test names — ErrorNote.translate() resolves a bare name against the app's main bundle
  // (`validation.<key>`), which the task lib's own `validations` scope does not populate.
  test('taskArchiveDays', TASK_I18N_KEYS.validations_taskArchiveDaysRange, () => {
    enforce(model.taskArchiveDays).isNumber().greaterThanOrEquals(TASK_ARCHIVE_DAYS_MIN).lessThanOrEquals(TASK_ARCHIVE_DAYS_MAX);
  });

  test('taskArchiveDays', TASK_I18N_KEYS.validations_taskArchiveDaysInteger, () => {
    enforce(isInteger(model.taskArchiveDays)).isTruthy();
  });

  // diaryTenantId: a selector value (a tenant id, or '' for "no diary") — no length cap,
  // membership in the catalogue is enforced by the select, not by this suite (building-forms rule 1).
});
