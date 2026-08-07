import { Signal } from '@angular/core';

const PFX = '@consent/ui.';

export const CONSENT_I18N_KEYS = {
  banner_aria: PFX + 'consent.banner.aria',
  banner_text: PFX + 'consent.banner.text',
  banner_acceptAll: PFX + 'consent.banner.acceptAll',
  banner_rejectAll: PFX + 'consent.banner.rejectAll',
  banner_customize: PFX + 'consent.banner.customize',
  banner_save: PFX + 'consent.banner.save',
  necessary_title: PFX + 'consent.necessary.title',
  necessary_description: PFX + 'consent.necessary.description',
  analytics_title: PFX + 'consent.analytics.title',
  analytics_description: PFX + 'consent.analytics.description',
  marketing_title: PFX + 'consent.marketing.title',
  marketing_description: PFX + 'consent.marketing.description',
} satisfies Record<string, string>;

export type ConsentI18n = { [K in keyof typeof CONSENT_I18N_KEYS]: Signal<string> };
