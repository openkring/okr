import { Signal } from '@angular/core';

const PFX = '@project/project/feature.';

/** The `i18n` scope of the `project_state` category (items: planned, active, completed, cancelled). */
export const PROJECT_I18N_SCOPE = '@project/project/feature';

export const PROJECT_I18N_KEYS = {
  title:             PFX + 'title',
  plural:            PFX + 'plural',

  create:            PFX + 'create.label',
  update:            PFX + 'update.label',
  view:              PFX + 'view.label',
  cancel:            '@cancel',
  save:              '@save.label',

  name:              PFX + 'name.label',
  name_placeholder:  PFX + 'name.placeholder',
  name_helper:       PFX + 'name.helper',
  description:       PFX + 'description.label',
  description_placeholder: PFX + 'description.placeholder',
  startDate:         PFX + 'startDate.label',
  startDate_placeholder: PFX + 'startDate.placeholder',
  endDate:           PFX + 'endDate.label',
  endDate_placeholder: PFX + 'endDate.placeholder',
  projectManager:    PFX + 'projectManager.label',
  projectManager_note: PFX + 'projectManager.note',
  projectManager_select: PFX + 'projectManager.select',
  state:             PFX + 'state.label',
  notes:             PFX + 'notes.label',
  notes_placeholder: PFX + 'notes.placeholder',

  select_search:     PFX + 'select.search',
  select_notFound:   PFX + 'select.notFound',
  archived:          PFX + 'archived',

  tasks:             PFX + 'tasks',
  result:            PFX + 'result.label',
  duplicate:         PFX + 'duplicate',
  duplicateConfirm:  PFX + 'duplicateConfirm',
  backlog:           PFX + 'backlog',
  noProject:         PFX + 'noProject',
  resultIncome:      PFX + 'result.income',
  resultExpense:     PFX + 'result.expense',
  resultTotal:       PFX + 'result.total',
  resultEmpty:       PFX + 'result.empty',
  resultPdfTitle:    PFX + 'result.pdfTitle',
  resultBooks:       PFX + 'result.books',
  resultPeriodAll:   PFX + 'result.periodAll',
  exportPdf:         PFX + 'exportPdf',
  context_add:       PFX + 'context.add',

  open:              PFX + 'open',
  delete:            PFX + 'delete',
  deleteConfirm:     PFX + 'deleteConfirm',
  empty:             PFX + 'empty',
  copySuffix:        PFX + 'copySuffix',
  duplicated:        PFX + 'duplicated',
  notFound:          PFX + 'notFound',
  duplicatedPartial: PFX + 'duplicatedPartial',
  duplicateFailed:   PFX + 'duplicateFailed',

  validation_endBeforeStart: PFX + 'validation.endBeforeStart',
} satisfies Record<string, string>;

export type ProjectI18n = { [K in keyof typeof PROJECT_I18N_KEYS]: Signal<string> };
