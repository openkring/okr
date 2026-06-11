import { Signal } from '@angular/core';

const PFX = '@task/feature.';

export const TASK_I18N_KEYS = {
  task:                           PFX + 'task',
  tasks:                          PFX + 'tasks',
  desc:                           PFX + 'desc',
  empty:                          PFX + 'empty',
  empty_my:                       PFX + 'empty-my',

  calendarName_label:              PFX + 'calendarName.label',
  calendarName_description:        PFX + 'calendarName.description',
  calendarName_addLabel:           PFX + 'calendarName.addLabel',

  quick_entry_label:              PFX + 'taskQuickEntry.label',
  quick_entry_placeholder:        PFX + 'taskQuickEntry.placeholder',
  quick_entry_helper:             PFX + 'taskQuickEntry.helper',

  create:                         PFX + 'create.label',
  create_conf:                    PFX + 'create.conf',
  create_error:                   PFX + 'create.error',
  delete:                         PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  delete_conf:                    PFX + 'delete.conf',
  delete_error:                   PFX + 'delete.error',
  update:                         PFX + 'update.label',
  update_conf:                    PFX + 'update.conf',
  update_error:                   PFX + 'update.error',
  view:                           PFX + 'view.label',

  done:                           PFX + 'done',
  as_title:                       '@actionsheet.title',
  cancel:                         '@cancel',
  ok:                             '@ok',
  save:                           '@save.label',

  list_header_name:               PFX + 'list.header.name',
  list_header_dueDate:            PFX + 'list.header.dueDate',
  list_header_assignee:           PFX + 'list.header.assignee',
  list_header_state:              PFX + 'list.header.state',

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
  dueDate_error:                  PFX + 'dueDate.error',
  
  completionDate_label:            PFX + 'completionDate.label',
  completionDate_placeholder:      PFX + 'completionDate.placeholder',
  completionDate_helper:           PFX + 'completionDate.helper',
  completionDate_error:           PFX + 'completionDate.error',

  // task_state: explicit
  state_label:                     PFX + 'task_state.label',
  state_all:                       PFX + 'task_state.all.label',

  priority:                        PFX + 'priority.label',
  importance:                      PFX + 'importance.label',
  assignee:                        PFX + 'assignee.label',
  assignee_description:            PFX + 'assignee.description',
  author:                          PFX + 'author.label',
  author_description:              PFX + 'author.description',
  scope:                           PFX + 'scope.label',
  scope_description:               PFX + 'scope.description',

  validations_taskModelType:       PFX + 'validations.taskModelType'
  
} satisfies Record<string, string>;

export type TaskI18n = { [K in keyof typeof TASK_I18N_KEYS]: Signal<string> };
