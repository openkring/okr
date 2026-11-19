import { Signal } from '@angular/core';

/**
 * This domain has no `util` layer — the two search components are self-contained and are
 * consumed by four different domains (person, org, address, membership). They therefore own
 * their own scope and resolve it directly instead of taking an `[i18n]` input from each parent.
 */
const PFX = '@subject/swisscities/ui.';

export const SWISSCITIES_I18N_KEYS = {
  search_title:       PFX + 'search.title',
  search_placeholder: PFX + 'search.placeholder',
  empty:              PFX + 'empty',
} satisfies Record<string, string>;

export type SwissCitiesI18n = { [K in keyof typeof SWISSCITIES_I18N_KEYS]: Signal<string> };
