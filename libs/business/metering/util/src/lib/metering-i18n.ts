import { Signal } from '@angular/core';

/**
 * MUST mirror the lib's physical path under `libs/` — `libs/business/metering/util` →
 * `'@business/metering/util.'`. A wrong prefix makes every key 404 at runtime and nothing in the
 * build or the test suite catches it.
 */
const PFX = '@business/metering/util.';

export const METERING_I18N_KEYS = {
  records:              PFX + 'records.plural',
  entries:              PFX + 'entries.plural',
  empty_records:        PFX + 'records.empty',
  empty_entries:        PFX + 'entries.empty',
  period_label:         PFX + 'period.label',

  rec_header_customer:  PFX + 'records.header.customer',
  rec_header_partner:   PFX + 'records.header.partner',
  rec_header_users:     PFX + 'records.header.users',
  rec_header_addOns:    PFX + 'records.header.addOns',
  rec_header_received:  PFX + 'records.header.received',

  ent_header_customer:  PFX + 'entries.header.customer',
  ent_header_band:      PFX + 'entries.header.band',
  ent_header_subtotal:  PFX + 'entries.header.subtotal',
  ent_header_commission: PFX + 'entries.header.commission',

  total_commission:     PFX + 'entries.total',
  run_label:            PFX + 'run.label',
  run_confirm:          PFX + 'run.confirm',
  run_conf:             PFX + 'run.conf',
  run_error:            PFX + 'run.error',
} satisfies Record<string, string>;

export type MeteringI18n = { [K in keyof typeof METERING_I18N_KEYS]: Signal<string> };
