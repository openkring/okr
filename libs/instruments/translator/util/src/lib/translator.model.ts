/** Source language «Sprache erkennen»: the provider detects it. */
export const AUTO_DETECT = '';

/** Longest text one call translates (the provider bills per character). */
export const TRANSLATOR_MAX_TEXT = 1000;

/** The language pair the user picked and the live view's flashlight; remembered per device. `source` may be AUTO_DETECT. */
export interface TranslatorSettings {
  source: string;
  target: string;
  torch: boolean;
}

export const DEFAULT_TRANSLATOR_SETTINGS: TranslatorSettings = { source: AUTO_DETECT, target: 'en', torch: false };

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

/** The live view: all new text blocks of one camera frame in one call (LIVE_MAX_BLOCKS, LIVE_MAX_CHARS). */
export interface TranslateManyReq {
  op: 'translateMany';
  texts: string[];
  source: string;
  target: string;
}

export interface TranslateManyRes {
  /** Same order as the request's texts. */
  translations: string[];
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
