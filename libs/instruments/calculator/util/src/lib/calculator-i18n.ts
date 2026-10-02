import { Signal } from '@angular/core';

import { PFX } from './scope';
import { UNIT_CATEGORIES, UnitCategoryId } from './calculator-units';

export const CALCULATOR_I18N_KEYS = {
  title:              PFX + 'title',
  profile_basic:      PFX + 'profile.basic',
  profile_scientific: PFX + 'profile.scientific',
  profile_programmer: PFX + 'profile.programmer',
  profile_convert:    PFX + 'profile.convert',
  rpn_title:          PFX + 'rpn.title',
  error:              PFX + 'error',
  history_title:      PFX + 'history.title',
  history_clear:      PFX + 'history.clear',
  history_empty:      PFX + 'history.empty',
  signed:             PFX + 'programmer.signed',
  wordSize:           PFX + 'programmer.wordSize',
  convert_category:   PFX + 'convert.category',
  convert_from:       PFX + 'convert.from',
  convert_to:         PFX + 'convert.to',
  convert_swap:       PFX + 'convert.swap',
} satisfies Record<string, string>;

export type CalculatorI18n = { [K in keyof typeof CALCULATOR_I18N_KEYS]: Signal<string> };

export function unitI18nId(categoryId: UnitCategoryId, unitId: string): string {
  return `${categoryId}_${unitId}`;
}

export const UNIT_I18N_KEYS: Record<string, string> = Object.fromEntries(
  UNIT_CATEGORIES.flatMap(c => c.units.map(u => [unitI18nId(c.id, u.id), `${PFX}convert.units.${c.id}.${u.id}`])),
);

export const CATEGORY_I18N_KEYS = Object.fromEntries(
  UNIT_CATEGORIES.map(c => [c.id, `${PFX}convert.categories.${c.id}`]),
) as Record<UnitCategoryId, string>;
