import { enforce, staticSuite, test } from 'vest';

import { AppConfig } from '@okr/shared-models';
import { booleanValidations } from '@okr/shared-util-core';

import { AOC_COOKIE_BANNER_I18N_KEYS } from './aoc-i18n';

/** The languages the banner text can be written in — the app's five UI languages. */
export const COOKIE_BANNER_LANGUAGES = ['de', 'en', 'fr', 'es', 'it'] as const;
export type CookieBannerLanguage = typeof COOKIE_BANNER_LANGUAGES[number];

/**
 * Longest banner text per language. Exported so the form's `[maxLength]` binds to the SAME
 * constant this suite enforces (building-forms rule 2). A notice, not a policy: the
 * Datenschutzerklärung is linked from the banner.
 */
export const COOKIE_BANNER_TEXT_LENGTH = 1000;

/**
 * The form model of AOC «Datenschutz»: the two `AppConfig` cookie-notice fields, with the
 * per-language map flattened into one string per language so each binds to its own field.
 * Not a Firestore model — no `okey`/`tenants`/`tags`.
 */
export type CookieBannerSettings = {
  cookieBannerEnabled: boolean;
} & { [L in CookieBannerLanguage as `text_${L}`]: string };

/** Read the settings off an `AppConfig`; legacy docs lack both fields. */
export function toCookieBannerSettings(config: Partial<AppConfig> | undefined): CookieBannerSettings {
  const texts = config?.cookieBannerText ?? {};
  const settings = { cookieBannerEnabled: config?.cookieBannerEnabled === true } as CookieBannerSettings;
  for (const lang of COOKIE_BANNER_LANGUAGES) {
    settings[`text_${lang}`] = texts[lang] ?? '';
  }
  return settings;
}

/**
 * Back to the `AppConfig` patch. Every language is written, an emptied one as `''`, so the
 * stored map never keeps a text the admin deleted (a merge write would otherwise leave it).
 */
export function fromCookieBannerSettings(settings: CookieBannerSettings): Pick<AppConfig, 'cookieBannerEnabled' | 'cookieBannerText'> {
  const cookieBannerText: Record<string, string> = {};
  for (const lang of COOKIE_BANNER_LANGUAGES) {
    cookieBannerText[lang] = (settings[`text_${lang}`] ?? '').trim();
  }
  return { cookieBannerEnabled: settings.cookieBannerEnabled === true, cookieBannerText };
}

export const cookieBannerSettingsValidations = staticSuite((model: CookieBannerSettings) => {
  booleanValidations('cookieBannerEnabled', model.cookieBannerEnabled);
  for (const lang of COOKIE_BANNER_LANGUAGES) {
    const field = `text_${lang}` as const;
    // Messages are '@'-prefixed scoped i18n keys: ErrorNote resolves a bare name against the
    // app's main bundle, which the aoc scope does not populate.
    test(field, AOC_COOKIE_BANNER_I18N_KEYS.validations_textLength, () => {
      enforce(model[field] ?? '').isString().shorterThanOrEquals(COOKIE_BANNER_TEXT_LENGTH);
    });
  }
});
