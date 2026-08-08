import { Signal } from '@angular/core';

/**
 * MUST mirror the lib's physical path under `libs/` — `libs/business/prospect/util` →
 * `'@business/prospect/util.'`. A wrong prefix makes every key 404 at runtime and nothing in the
 * build or the test suite catches it.
 */
const PFX = '@business/prospect/util.';

export const PROSPECT_I18N_KEYS = {
  plural:            PFX + 'plural',
  empty:             PFX + 'empty',

  header_name:       PFX + 'header.name',
  header_segment:    PFX + 'header.segment',
  header_status:     PFX + 'header.status',
  header_partner:    PFX + 'header.partner',
  header_expires:    PFX + 'header.expires',

  status_open:       PFX + 'status.open',
  status_claimed:    PFX + 'status.claimed',
  status_converted:  PFX + 'status.converted',
  status_expired:    PFX + 'status.expired',
  status_withdrawn:  PFX + 'status.withdrawn',

  as_title:          PFX + 'as.title',
  as_revoke:         PFX + 'as.revoke',
  cancel:            PFX + 'as.cancel',

  revoke_confirm:    PFX + 'revoke.confirm',
  revoke_conf:       PFX + 'revoke.conf',
  revoke_error:      PFX + 'revoke.error',
  /** Shown after a revocation that hit an active claim — the partner bkaiser must now write to. */
  revoke_notify:     PFX + 'revoke.notify',
} satisfies Record<string, string>;

export type ProspectI18n = { [K in keyof typeof PROSPECT_I18N_KEYS]: Signal<string> };
