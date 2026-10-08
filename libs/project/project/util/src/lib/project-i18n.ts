import { Signal } from '@angular/core';

const PFX = '@project/project/feature.';

/** The `i18n` scope of the `project_state` category (items: planned, active, completed, cancelled). */
export const PROJECT_I18N_SCOPE = '@project/project/feature';

export const PROJECT_I18N_KEYS = {
  title:             PFX + 'title',
  plural:            PFX + 'plural',

  name:              PFX + 'name.label',
  description:       PFX + 'description.label',
  startDate:         PFX + 'startDate.label',
  endDate:           PFX + 'endDate.label',
  projectManager:    PFX + 'projectManager.label',
  state:             PFX + 'state.label',

  tasks:             PFX + 'tasks',
  result:            PFX + 'result',
  duplicate:         PFX + 'duplicate',
  duplicateConfirm:  PFX + 'duplicateConfirm',
  backlog:           PFX + 'backlog',
  noProject:         PFX + 'noProject',
  resultIncome:      PFX + 'result.income',
  resultExpense:     PFX + 'result.expense',
  resultTotal:       PFX + 'result.total',
  exportPdf:         PFX + 'exportPdf',
  context_add:       PFX + 'context.add',

  validation_endBeforeStart: PFX + 'validation.endBeforeStart',
} satisfies Record<string, string>;

export type ProjectI18n = { [K in keyof typeof PROJECT_I18N_KEYS]: Signal<string> };
