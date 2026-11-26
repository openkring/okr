import { Signal } from '@angular/core';

/** The Vollmacht strings live in this lib's scope: `src/i18n/*.json` is served as `assets/i18n/relationship/mandate/util/<lang>.json`. */
const PFX = '@relationship/mandate/util.';

export const MANDATE_I18N_KEYS = {
  title:           PFX + 'title',
  given:           PFX + 'given',
  received:        PFX + 'received',
  create:          PFX + 'create',
  record_proxy:    PFX + 'record_proxy',
  revoke:          PFX + 'revoke',
  give_back:       PFX + 'give_back',
  attend_for:      PFX + 'attend_for',
  unattend_for:    PFX + 'unattend_for',
  for_marker:      PFX + 'for_marker',
  represented_by:  PFX + 'represented_by',
  holds_proxies:   PFX + 'holds_proxies',
  acted_for:       PFX + 'acted_for',
  until_revoked:   PFX + 'until_revoked',
  action_attend:   PFX + 'action_attend',
  action_answer:   PFX + 'action_answer',
  notice_attend:   PFX + 'notice_attend',
  notice_unattend: PFX + 'notice_unattend',
  notice_answer:   PFX + 'notice_answer',
  notice_created:  PFX + 'notice_created',
  no_proxies:      PFX + 'no_proxies',
  // profile section «Vollmachten» and the edit modal (spec 1.180 §5.1)
  intro:               PFX + 'intro',
  given_empty:         PFX + 'given_empty',
  received_empty:      PFX + 'received_empty',
  grantee_label:       PFX + 'grantee_label',
  grantee_pick:        PFX + 'grantee_pick',
  grantee_change:      PFX + 'grantee_change',
  actions_label:       PFX + 'actions_label',
  validTo_label:       PFX + 'validTo_label',
  validTo_placeholder: PFX + 'validTo_placeholder',
  validTo_helper:      PFX + 'validTo_helper',
  valid_until:         PFX + 'valid_until',
  state_revoked:       PFX + 'state_revoked',
  state_expired:       PFX + 'state_expired',
  state_pending:       PFX + 'state_pending',
  recorded_by:         PFX + 'recorded_by',
  revoke_confirm:      PFX + 'revoke_confirm',
  give_back_confirm:   PFX + 'give_back_confirm',
  save_conf:           PFX + 'save_conf',
  save_error:          PFX + 'save_error',
  revoke_error:        PFX + 'revoke_error',
  person_unknown:      PFX + 'person_unknown',
  cancel:              PFX + 'cancel',
  // refusals of a delegated change (spec 1.180 §5.2)
  mandate_inactive:    PFX + 'mandate_inactive',
  mandate_check_error: PFX + 'mandate_check_error',
  // recording a proxy for a meeting (spec 1.180 §6)
  proxy_no_candidates: PFX + 'proxy_no_candidates',
  proxy_closed:        PFX + 'proxy_closed',
  proxy_cap_reached:   PFX + 'proxy_cap_reached',
} satisfies Record<string, string>;

export type MandateI18n = { [K in keyof typeof MANDATE_I18N_KEYS]: Signal<string> };

/** Vest messages of the mandate suite: scoped keys, resolved by okr-error-note. */
export const MANDATE_VALIDATION_KEYS = {
  grantee_required:       PFX + 'validation.grantee_required',
  grantee_is_grantor:     PFX + 'validation.grantee_is_grantor',
  duplicate_family:       PFX + 'validation.duplicate_family',
  actions_required:       PFX + 'validation.actions_required',
  validTo_before_validFrom: PFX + 'validation.validTo_before_validFrom',
  meeting_required:       PFX + 'validation.meeting_required',
} as const;
