import { isLangCode } from './translator-lang';
import { AUTO_DETECT, DEFAULT_TRANSLATOR_SETTINGS, TranslatorSettings } from './translator.model';

export const TRANSLATOR_STORAGE_KEY = 'okr.translator.v1';

export function serializeTranslator(settings: TranslatorSettings): string {
  return JSON.stringify({ source: settings.source, target: settings.target });
}

/** Restores the stored pair; anything missing or invalid falls back to its default, field by field. */
export function restoreTranslator(json: string | null): TranslatorSettings {
  if (!json) return { ...DEFAULT_TRANSLATOR_SETTINGS };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...DEFAULT_TRANSLATOR_SETTINGS };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const source = o['source'];
  const target = o['target'];
  return {
    source: source === AUTO_DETECT || isLangCode(source) ? source : DEFAULT_TRANSLATOR_SETTINGS.source,
    target: isLangCode(target) ? target : DEFAULT_TRANSLATOR_SETTINGS.target,
  };
}
