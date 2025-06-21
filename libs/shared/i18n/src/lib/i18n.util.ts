import { HashMap, getBrowserLang, translate } from '@jsverse/transloco';

export function bkTranslate(key: string | null | undefined, argument?: HashMap): string {
  if (!key || key.length === 0) return '';
  const _key = structuredClone(key);
  if (_key.startsWith('@')) {
    if (argument) {
      return translate(_key.substring(1), argument);
    } else {
      return translate(_key.substring(1));
    }
  } else {
    return _key;
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
  const _browserLanguage = getBrowserLang();
  if (!_browserLanguage) throw new Error('i18n.util.getSystemLang(): ERROR: browser language can not be determined.');
  const _selectedLanguage = configuredLanguage ?? _browserLanguage;

  // if this language is not supported, choose the default language instead
  return (availableLanguages.indexOf(_selectedLanguage) < 0) ? defaultLanguage : _selectedLanguage;
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