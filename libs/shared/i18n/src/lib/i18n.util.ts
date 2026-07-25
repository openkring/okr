import { getBrowserLang, translate } from '@jsverse/transloco';

/**
 * Select the used language based on 1) user settings (configuredLanguage), 2) browserLanguage, 3) defaultLanguage.
 * The returned code is always a member of `availableLanguages` (when the list is non-empty): a tenant may
 * pass its enabled subset here, and we must never activate a language it disabled — not even the global
 * default. When neither the configured nor the browser language is available, we fall back to
 * `defaultLanguage` only if it is itself available, otherwise to the first available language.
 * @param availableLanguages the list of languages that are available/enabled in the application.
 * @param defaultLanguage the preferred fallback language; used only if it is in availableLanguages.
 * @param configuredLanguage the language as set in the user profile settings.
 * @returns the selected language code (always one of availableLanguages when that list is non-empty)
 */
export function selectLanguage(availableLanguages: string[], defaultLanguage: string, configuredLanguage?: string): string {
  const browserLanguage = getBrowserLang();
  if (!browserLanguage) throw new Error('i18n.util.getSystemLang(): ERROR: browser language can not be determined.');
  const selectedLanguage = configuredLanguage ?? browserLanguage;

  // 1) use the configured/browser language if it is available/enabled
  if (availableLanguages.indexOf(selectedLanguage) >= 0) return selectedLanguage;

  // 2) otherwise fall back to the default — but only if it is itself available/enabled. A tenant can
  //    disable the global default via enabledLanguages, so guard against activating a disabled language.
  if (availableLanguages.indexOf(defaultLanguage) >= 0) return defaultLanguage;

  // 3) default is also disabled → use the first available language (e.g. a single-language tenant).
  return availableLanguages[0] ?? defaultLanguage;
}

export function getLabel(label: string): string {
  const key = label.startsWith('@') ? label.substring(1) : label;
  return translate(key);
}

export function convertCountryCode(countryCode: string): string {
  return translate('general.countries.' + countryCode.toUpperCase());
}

export function convertStateCode(stateCode: string): string {
  return translate('general.states.CH.' + stateCode.toUpperCase());
}