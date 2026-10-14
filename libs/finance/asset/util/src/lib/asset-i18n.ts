import { Signal } from '@angular/core';

const PFX = '@finance/asset/feature.';

export const ASSET_I18N_KEYS = {
  asset:                PFX + 'singular',
  assets:               PFX + 'plural',
  empty:                PFX + 'empty',
  empty_hint:           PFX + 'emptyHint',
  acquisition_value:    PFX + 'value.acquisition.label',

  list_title:           PFX + 'list.title',
  deduction:            PFX + 'deduction.label',
  deduction_run:        PFX + 'deduction.run',
  // yearly depreciation run (spec 1.103)
  run_explain: PFX + 'run.explain',
  run_year: PFX + 'run.year',
  run_asset: PFX + 'run.asset',
  run_bookValueStart: PFX + 'run.bookValueStart',
  run_amount: PFX + 'run.amount',
  run_bookValueEnd: PFX + 'run.bookValueEnd',
  run_status_booked: PFX + 'run.booked',
  run_open: PFX + 'run.open',
  run_post: PFX + 'run.post',
  run_total: PFX + 'run.total',
  run_empty: PFX + 'run.empty',
  run_bookedInfo: PFX + 'run.bookedInfo',
  run_showBooking: PFX + 'run.showBooking',
  run_booked: PFX + 'run.booked_toast',
  run_periodLocked: PFX + 'run.periodLocked',
  run_accountsMissing: PFX + 'run.accountsMissing',
  run_alreadyBooked: PFX + 'run.alreadyBooked',
  run_failed: PFX + 'run.failed',

  name:                 PFX + 'name.label',
  number:               PFX + 'number.label',
  category:             PFX + 'category.label',
  acquisition_date:     PFX + 'date.acquisition.label',
  life:                 PFX + 'life.label',
  cost_center:          PFX + 'costCenter.label',
  period_end:           PFX + 'date.end.label',
  preview:              PFX + 'preview.label',

  book:                 PFX + 'book.label',
  create:               PFX + 'create.label',
  delete:               PFX + 'delete.label',
  update:               PFX + 'update.label',
  view:                 PFX + 'view.label',

  cancel:               '@cancel',
  save:                 '@save.label',
  loading:              '@loading'
} satisfies Record<string, string>;

export type AssetI18n = { [K in keyof typeof ASSET_I18N_KEYS]: Signal<string> };
