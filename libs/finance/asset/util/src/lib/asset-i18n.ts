import { Signal } from '@angular/core';

const PFX = '@finance/asset/feature.';

export const ASSET_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty:      PFX + 'empty',
  as_view:    PFX + 'actionsheet.view',
  as_edit:    PFX + 'actionsheet.edit',
  as_create:  PFX + 'actionsheet.create',
  as_delete:  PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type AssetI18n = { [K in keyof typeof ASSET_I18N_KEYS]: Signal<string> };
