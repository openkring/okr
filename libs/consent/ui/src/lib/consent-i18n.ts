import { Signal } from '@angular/core';

const PFX = '@consent/ui.';

export const CONSENT_I18N_KEYS = {
  banner_aria: PFX + 'consent.banner.aria',
  /** The shipped default text; a tenant replaces it per language in AOC «Datenschutz». */
  banner_text: PFX + 'consent.banner.text',
  banner_ok: PFX + 'consent.banner.ok',
  banner_privacy: PFX + 'consent.banner.privacy',
} satisfies Record<string, string>;

export type ConsentI18n = { [K in keyof typeof CONSENT_I18N_KEYS]: Signal<string> };
