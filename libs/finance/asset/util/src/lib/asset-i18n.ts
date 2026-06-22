import { Signal } from '@angular/core';

const PFX = '@finance/asset/feature.';

export const ASSET_I18N_KEYS = {
  asset:                PFX + 'singular',
  assets:               PFX + 'plural',
  empty:                PFX + 'empty',

  list_title:           PFX + 'list.title',
  deduction:            PFX + 'deduction.label',
  deduction_run:        PFX + 'deduction.run',

  name:                 PFX + 'name.label',
  number:               PFX + 'name.number',
  category:             PFX + 'name.category',
  acquisition_date:     PFX + 'date.acquisition.label',
  life:                 PFX + 'life.label',
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
