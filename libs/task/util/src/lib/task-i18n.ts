import { Signal } from '@angular/core';

const PFX = '@task/feature.';

export const TASK_I18N_KEYS = {
  task:                           PFX + 'task',
  tasks:                          PFX + 'tasks',
  empty:                          PFX + 'empty',

  calendarName_label:              PFX + 'calendarName.label',
  calendarName_description:        PFX + 'calendarName.description',
  calendarName_addLabel:           PFX + 'calendarName.addLabel',

  quick_entry_label:              PFX + 'taskQuickEntry.label',
  quick_entry_placeholder:        PFX + 'taskQuickEntry.placeholder',
  quick_entry_helper:             PFX + 'taskQuickEntry.helper',

  create:                         PFX + 'create.label',
  delete:                         PFX + 'delete.label',
  update:                         PFX + 'update.label',
  view:                           PFX + 'view.label',

  done:                           PFX + 'done',
  as_title:                       '@actionsheet.title',
  cancel:                         '@cancel',
  ok:                             '@ok',
  save:                           '@save.label',


  bkey_label:                      PFX + 'bkey.label',
  bkey_placeholder:                PFX + 'bkey.placeholder',
  bkey_helper:                     PFX + 'bkey.helper',
  name_label:                      PFX + 'name.label',
  name_placeholder:                PFX + 'name.placeholder',
  name_helper:                     PFX + 'name.helper',
  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',
  dueDate_label:                   PFX + 'dueDate.label',
  dueDate_placeholder:             PFX + 'dueDate.placeholder',
  dueDate_helper:                  PFX + 'dueDate.helper',
  completionDate_label:            PFX + 'completionDate.label',
  completionDate_placeholder:      PFX + 'completionDate.placeholder',
  completionDate_helper:           PFX + 'completionDate.helper',
  state:                           PFX + 'state.label',
  priority:                        PFX + 'priority.label',
  importance:                      PFX + 'importance.label',
} satisfies Record<string, string>;

export type TaskI18n = { [K in keyof typeof TASK_I18N_KEYS]: Signal<string> };
