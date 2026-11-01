/**
 * Provider language code → Tesseract model name (tessdata), for the live view's text recognition.
 * Only languages with a Tesseract model are listed; a source language missing here cannot be read
 * from the camera. Both the current and the legacy Google codes are mapped (`he`/`iw`, `jv`/`jw`).
 */
const TESSERACT_MODELS: Record<string, string> = {
  af: 'afr', am: 'amh', ar: 'ara', as: 'asm', az: 'aze', be: 'bel', bg: 'bul', bn: 'ben', bo: 'bod', br: 'bre',
  bs: 'bos', ca: 'cat', ceb: 'ceb', co: 'cos', cs: 'ces', cy: 'cym', da: 'dan', de: 'deu', dv: 'div', dz: 'dzo',
  el: 'ell', en: 'eng', eo: 'epo', es: 'spa', et: 'est', eu: 'eus', fa: 'fas', fi: 'fin', fil: 'fil', fo: 'fao',
  fr: 'fra', fy: 'fry', ga: 'gle', gd: 'gla', gl: 'glg', gu: 'guj', he: 'heb', hi: 'hin', hr: 'hrv', ht: 'hat',
  hu: 'hun', hy: 'hye', id: 'ind', is: 'isl', it: 'ita', iu: 'iku', iw: 'heb', ja: 'jpn', jv: 'jav', jw: 'jav',
  ka: 'kat', kk: 'kaz', km: 'khm', kn: 'kan', ko: 'kor', ku: 'kmr', ky: 'kir', la: 'lat', lb: 'ltz', lo: 'lao',
  lt: 'lit', lv: 'lav', mi: 'mri', mk: 'mkd', ml: 'mal', mn: 'mon', mr: 'mar', ms: 'msa', mt: 'mlt', my: 'mya',
  ne: 'nep', nl: 'nld', no: 'nor', oc: 'oci', or: 'ori', pa: 'pan', pl: 'pol', ps: 'pus', pt: 'por', qu: 'que',
  ro: 'ron', ru: 'rus', sa: 'san', sd: 'snd', si: 'sin', sk: 'slk', sl: 'slv', sq: 'sqi', sr: 'srp', su: 'sun',
  sv: 'swe', sw: 'swa', ta: 'tam', te: 'tel', tg: 'tgk', th: 'tha', ti: 'tir', tl: 'fil', to: 'ton', tr: 'tur',
  tt: 'tat', ug: 'uig', uk: 'ukr', ur: 'urd', uz: 'uzb', vi: 'vie', yi: 'yid', yo: 'yor',
  'zh': 'chi_sim', 'zh-CN': 'chi_sim', 'zh-TW': 'chi_tra',
};

/** Every model the upload script puts into Storage (deduplicated, sorted). */
export const TESSERACT_MODEL_NAMES: string[] = [...new Set(Object.values(TESSERACT_MODELS))].sort();

/** The Tesseract model for a provider code (`pt-BR` → `por` via its base language), or null. */
export function tesseractModel(code: string): string | null {
  return TESSERACT_MODELS[code] ?? TESSERACT_MODELS[code.split('-')[0]] ?? null;
}

/**
 * The models the live view loads: the chosen source language, or with «Sprache erkennen» the UI
 * language plus English (most signs abroad are in the local language or English). Joined with `+`
 * as Tesseract expects; null when nothing can be read.
 */
export function ocrModels(source: string, uiLang: string): string | null {
  const models = source
    ? [tesseractModel(source)]
    : [tesseractModel(uiLang), 'eng'];
  const unique = [...new Set(models.filter((m): m is string => !!m))];
  return unique.length > 0 ? unique.join('+') : null;
}
