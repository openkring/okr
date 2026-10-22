import type { Signal } from '@angular/core';

import type { FileTransferRejection } from './file-transfer-limits';

// mirrors the lib path: libs/content/file-transfer/util/src/i18n/<lang>.json
const PFX = '@content/file-transfer/util.';

/** Texts of the quick file transfer (spec 1.115). Placeholders use single braces + fill(). */
export const FILE_TRANSFER_I18N_KEYS = {
  cancel:                     PFX + 'cancel',
  save:                       PFX + 'save',
  send:                       PFX + 'send',
  remove:                     PFX + 'remove',

  // send form + new-transfer modal
  new_title:                  PFX + 'new.title',
  new_title_chat:             PFX + 'new.titleChat',
  new_chat_hint:              PFX + 'new.chatHint',
  files_label:                PFX + 'files.label',
  files_helper:               PFX + 'files.helper',
  files_total:                PFX + 'files.total',
  groups_title:               PFX + 'groups.title',
  groups_add:                 PFX + 'groups.add',
  persons_title:              PFX + 'persons.title',
  persons_add:                PFX + 'persons.add',
  emails_title:               PFX + 'emails.title',
  emails_add:                 PFX + 'emails.add',
  emails_description:         PFX + 'emails.description',
  consent_hint:               PFX + 'consent.hint',
  message_label:              PFX + 'message.label',
  message_placeholder:        PFX + 'message.placeholder',
  message_helper:             PFX + 'message.helper',
  lifetime_label:             PFX + 'lifetime.label',
  lifetime_placeholder:       PFX + 'lifetime.placeholder',
  lifetime_helper:            PFX + 'lifetime.helper',
  password_label:             PFX + 'password.label',
  password_placeholder:       PFX + 'password.placeholder',
  password_helper:            PFX + 'password.helper',

  // info modal
  info_title:                 PFX + 'info.title',
  info_what:                  PFX + 'info.what',
  info_limits_title:          PFX + 'info.limitsTitle',
  info_limit_transfer:        PFX + 'info.limitTransfer',
  info_limit_open:            PFX + 'info.limitOpen',
  info_limit_externals:       PFX + 'info.limitExternals',
  info_lifetime:              PFX + 'info.lifetime',
  info_who_title:             PFX + 'info.whoTitle',
  info_who_members:           PFX + 'info.whoMembers',
  info_who_groups:            PFX + 'info.whoGroups',
  info_who_outside:           PFX + 'info.whoOutside',
  info_deleted:               PFX + 'info.deleted',
  info_log:                   PFX + 'info.log',
  info_consent_title:         PFX + 'info.consentTitle',
  info_request_title:         PFX + 'info.requestTitle',
  info_request_text:          PFX + 'info.requestText',
  info_reason_label:          PFX + 'info.reasonLabel',
  info_reason_placeholder:    PFX + 'info.reasonPlaceholder',
  info_reason_none:           PFX + 'info.reasonNone',
  info_request:               PFX + 'info.request',

  // transfer card
  card_title:                 PFX + 'card.title',
  card_from:                  PFX + 'card.from',
  card_expires:               PFX + 'card.expires',
  card_expired:               PFX + 'card.expired',
  card_expired_badge:         PFX + 'card.expiredBadge',
  card_loading:               PFX + 'card.loading',
  card_play:                  PFX + 'card.play',
  card_view:                  PFX + 'card.view',
  card_download:              PFX + 'card.download',

  // limits form + edit modal
  limits_title:               PFX + 'limits.title',
  limits_placeholder:         PFX + 'limits.placeholder',
  limits_transfer_label:      PFX + 'limits.transferLabel',
  limits_transfer_helper:     PFX + 'limits.transferHelper',
  limits_open_label:          PFX + 'limits.openLabel',
  limits_open_helper:         PFX + 'limits.openHelper',
  limits_ceiling_label:       PFX + 'limits.ceilingLabel',
  limits_ceiling_helper:      PFX + 'limits.ceilingHelper',
  limits_default_lifetime_label:  PFX + 'limits.defaultLifetimeLabel',
  limits_default_lifetime_helper: PFX + 'limits.defaultLifetimeHelper',
  limits_max_lifetime_label:  PFX + 'limits.maxLifetimeLabel',
  limits_max_lifetime_helper: PFX + 'limits.maxLifetimeHelper',
  limits_externals_label:     PFX + 'limits.externalsLabel',
  limits_externals_helper:    PFX + 'limits.externalsHelper',
  limits_overrides_title:     PFX + 'limits.overridesTitle',
  limits_overrides_helper:    PFX + 'limits.overridesHelper',
  limits_overrides_add:       PFX + 'limits.overridesAdd',
  limits_overrides_empty:     PFX + 'limits.overridesEmpty',
  limits_override_transfer_label: PFX + 'limits.overrideTransferLabel',
  limits_override_open_label: PFX + 'limits.overrideOpenLabel',

  // server / form rejections (FileTransferRejection)
  rejection_tooLarge:         PFX + 'rejection.tooLarge',
  rejection_openTotalExceeded: PFX + 'rejection.openTotalExceeded',
  rejection_tooManyExternals: PFX + 'rejection.tooManyExternals',
  rejection_lifetimeTooLong:  PFX + 'rejection.lifetimeTooLong',
  rejection_noFiles:          PFX + 'rejection.noFiles',
  rejection_noRecipients:     PFX + 'rejection.noRecipients',
  rejection_invalidEmail:     PFX + 'rejection.invalidEmail',
  rejection_invalidRequest:   PFX + 'rejection.invalidRequest',
} satisfies Record<string, string>;

export type FileTransferI18n = { [K in keyof typeof FILE_TRANSFER_I18N_KEYS]: Signal<string> };

/** The i18n key of a rejection the server (or the form) reported. */
export function fileTransferRejectionKey(rejection: FileTransferRejection): string {
  return PFX + 'rejection.' + rejection;
}
