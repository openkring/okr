/** Source language «Sprache erkennen»: the provider detects it. */
export const AUTO_DETECT = '';

/** Longest text one call translates (the provider bills per character). */
export const TRANSLATOR_MAX_TEXT = 1000;

/** The language pair the user picked; remembered per device. `source` may be AUTO_DETECT. */
export interface TranslatorSettings {
  source: string;
  target: string;
}

export const DEFAULT_TRANSLATOR_SETTINGS: TranslatorSettings = { source: AUTO_DETECT, target: 'en' };

export interface TranslatorLanguage {
  /** BCP-47 code as the provider names it, e.g. `de`, `pt-PT`, `zh-CN`. */
  code: string;
  /** Name in the display language of the request. */
  name: string;
}

/** Ops of the `translator` callable. */
export interface TranslateReq {
  op: 'translate';
  text: string;
  /** AUTO_DETECT or a language code. */
  source: string;
  target: string;
}

export interface TranslateRes {
  translatedText: string;
  /** The detected source language when `source` was AUTO_DETECT, else null. */
  detectedSource: string | null;
  attribution: { provider: string; url: string };
}

export interface LanguagesReq {
  op: 'languages';
  /** Language the names are given in, e.g. the UI language `de`. */
  display: string;
}

export interface LanguagesRes {
  languages: TranslatorLanguage[];
}
