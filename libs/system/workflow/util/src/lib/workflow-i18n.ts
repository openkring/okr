import { Signal } from '@angular/core';

// the scope prefix must mirror the lib's path under libs/ — see the i18n skill
const FEAT = '@system/workflow/feature.';
const UI = '@system/workflow/ui.';

export const WORKFLOW_I18N_KEYS = {
  plural:                          FEAT + 'plural',
  empty:                           FEAT + 'empty',
  as_title:                        '@actionsheet.title',
  as_edit:                         FEAT + 'actionsheet.edit',
  as_delete:                       FEAT + 'actionsheet.delete',
  cancel:                          '@cancel',
  create_label:                    FEAT + 'operation.create.label',
  edit_label:                      FEAT + 'operation.edit.label',
  view_label:                      FEAT + 'operation.view.label',
  delete_confirm:                  FEAT + 'operation.delete.confirm',
  export_label:                    FEAT + 'operation.export.label',
  export_conf:                     FEAT + 'operation.export.conf',
  changeConfirmation_ok:           FEAT + 'changeConfirmation.ok',
  changeConfirmation_cancel:       FEAT + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: FEAT + 'changeConfirmation.confirmation',

  name_label:                UI + 'name.label',
  name_placeholder:          UI + 'name.placeholder',
  name_helper:               UI + 'name.helper',
  event_label:               UI + 'event.label',
  probe_label:               UI + 'probe.label',
  probeArg_label:            UI + 'probeArg.label',
  probeArg_placeholder:      UI + 'probeArg.placeholder',
  probeArg_helper:           UI + 'probeArg.helper',
  responsibilityKey_label:       UI + 'responsibilityKey.label',
  responsibilityKey_placeholder: UI + 'responsibilityKey.placeholder',
  responsibilityKey_helper:      UI + 'responsibilityKey.helper',
  messageKey_label:          UI + 'messageKey.label',
  messageKey_placeholder:    UI + 'messageKey.placeholder',
  messageKey_helper:         UI + 'messageKey.helper',
  dueInDays_label:           UI + 'dueInDays.label',
  dueInDays_helper:          UI + 'dueInDays.helper',
  notes_label:               UI + 'notes.label',
  notes_placeholder:         UI + 'notes.placeholder',
} satisfies Record<string, string>;

export type WorkflowI18n = { [K in keyof typeof WORKFLOW_I18N_KEYS]: Signal<string> };
