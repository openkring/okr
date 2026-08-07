import { Signal } from '@angular/core';

/**
 * MUST mirror the lib's physical path under `libs/` — `libs/business/partner/util` →
 * `'@business/partner/util.'`. A wrong prefix makes every key 404 at runtime and nothing in the
 * build or the test suite catches it.
 */
const PFX = '@business/partner/util.';

export const PARTNER_I18N_KEYS = {
  partner:              PFX + 'singular',
  partners:             PFX + 'plural',
  description:          PFX + 'description',
  empty:                PFX + 'empty',

  list_header_name:     PFX + 'list.header.name',
  list_header_status:   PFX + 'list.header.status',
  list_header_heartbeat: PFX + 'list.header.heartbeat',

  create:               PFX + 'create.label',
  create_conf:          PFX + 'create.conf',
  create_error:         PFX + 'create.error',
  update:               PFX + 'update.label',
  update_conf:          PFX + 'update.conf',
  update_error:         PFX + 'update.error',
  delete:               PFX + 'delete.label',
  delete_conf:          PFX + 'delete.conf',
  delete_confirm:       PFX + 'delete.confirm',
  delete_error:         PFX + 'delete.error',
  view:                 PFX + 'view.label',
  cancel:               PFX + 'cancel.label',
  save:                 PFX + 'save.label',

  name_label:           PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',
  orgKey_label:         PFX + 'orgKey.label',
  orgKey_placeholder:   PFX + 'orgKey.placeholder',
  orgKey_helper:        PFX + 'orgKey.helper',
  status_label:         PFX + 'status.label',
  status_placeholder:   PFX + 'status.placeholder',
  status_helper:        PFX + 'status.helper',
  contractStart_label:  PFX + 'contractStart.label',
  contractStart_placeholder: PFX + 'contractStart.placeholder',
  contractStart_helper: PFX + 'contractStart.helper',
  contractEnd_label:    PFX + 'contractEnd.label',
  contractEnd_placeholder: PFX + 'contractEnd.placeholder',
  contractEnd_helper:   PFX + 'contractEnd.helper',
  serviceUid_label:     PFX + 'serviceUid.label',
  serviceUid_placeholder: PFX + 'serviceUid.placeholder',
  serviceUid_helper:    PFX + 'serviceUid.helper',
  notes_label:          PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  heartbeat_ok:         PFX + 'heartbeat.ok',
  heartbeat_notice:     PFX + 'heartbeat.notice',
  heartbeat_termination: PFX + 'heartbeat.termination',
} satisfies Record<string, string>;

export type PartnerI18n = { [K in keyof typeof PARTNER_I18N_KEYS]: Signal<string> };
