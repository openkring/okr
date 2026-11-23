export type I18nString = Record<string, string>;

export function i18nString(de: string, en?: string): I18nString {
  const result: I18nString = { de };
  if (en !== undefined) result['en'] = en;
  return result;
}

export function resolveI18n(val: I18nString | undefined, lang: string): string {
  if (!val) return '';
  return val[lang] ?? val['de'] ?? '';
}

/** Who wrote a translation: the trigger ('auto') or a person ('manual'). Spec 1.161 §3.1. */
export type TranslationOrigin = 'auto' | 'manual';

export interface TranslationMeta {
  origin: TranslationOrigin;
  /** sha-256 (hex, first 16 chars) of the normalised German source the value was made from or reviewed against */
  srcHash: string;
  /** ISO, when the value was written */
  at: string;
}

/** field path → language → meta. Paths of an article: 'titleI18n', 'blocks.<id>.htmlI18n', 'blocks.<id>.cta.labelI18n'. */
export type I18nMeta = Record<string, Record<string, TranslationMeta>>;
