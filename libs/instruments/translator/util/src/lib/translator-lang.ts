import { AUTO_DETECT, TranslatorLanguage, TranslatorSettings } from './translator.model';

const LANG_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/** A language code the provider can be asked for (`de`, `pt-PT`, `zh-CN`, `mni-Mtei`). */
export function isLangCode(code: unknown): code is string {
  return typeof code === 'string' && LANG_CODE.test(code);
}

/**
 * Swaps source and target. With «Sprache erkennen» the detected language becomes the target's
 * counterpart; without a detection yet there is nothing to swap to, so the pair stays.
 */
export function swapLanguages(settings: TranslatorSettings, detected: string | null): TranslatorSettings {
  const source = settings.source === AUTO_DETECT ? detected : settings.source;
  if (!source || source === settings.target) return settings;
  return { ...settings, source: settings.target, target: source };
}

/** Sorts by name in the given locale; drops entries without a valid code and duplicates. */
export function sortLanguages(languages: TranslatorLanguage[], locale: string): TranslatorLanguage[] {
  const seen = new Set<string>();
  const valid = languages.filter(l => {
    if (!isLangCode(l.code) || seen.has(l.code)) return false;
    seen.add(l.code);
    return true;
  });
  const collator = new Intl.Collator(locale);
  return valid.sort((a, b) => collator.compare(a.name || a.code, b.name || b.code));
}

