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
