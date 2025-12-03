import { HashMap, getBrowserLang, translate } from '@jsverse/transloco';

export function bkTranslate(key: string | null | undefined, argument?: HashMap): string {
  if (!key || key.length === 0) return '';
  const clonedKey = structuredClone(key);
  if (clonedKey.startsWith('@')) {
    if (argument) {
      return translate(clonedKey.substring(1), argument);
    } else {
      return translate(clonedKey.substring(1));
    }
  } else {
    return clonedKey;
  }
}

/**
 * Select the used language based on 1) user settings (configuredLanguage), 2) _browserLanguage, 3) defaultLanguage
 * @param availableLanguages the list of languages that are available in the application.
 * @param defaultLang the default language to use if no other language is configured or available.
 * @param configuredLanguage the language as set in the user profile settings.
 * @returns the selected language code (one of app.config.provideTransloco.config.availableLangs)
 */
export function selectLanguage(availableLanguages: string[], defaultLanguage: string, configuredLanguage?: string): string {
  const browserLanguage = getBrowserLang();
  if (!browserLanguage) throw new Error('i18n.util.getSystemLang(): ERROR: browser language can not be determined.');
  const selectedLanguage = configuredLanguage ?? browserLanguage;

  // if this language is not supported, choose the default language instead
  return (availableLanguages.indexOf(selectedLanguage) < 0) ? defaultLanguage : selectedLanguage;
}

export function getLabel(label: string): string {
    return bkTranslate(label);
}

export function convertCountryCode(countryCode: string): string {
  return bkTranslate('@general.countries.' + countryCode.toUpperCase());
}

export function convertStateCode(stateCode: string): string {
  return bkTranslate('@general.states.CH.' + stateCode.toUpperCase());
}