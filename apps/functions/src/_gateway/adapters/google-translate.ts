// apps/functions/src/_gateway/adapters/google-translate.ts
//
// Google Cloud Translation (Basic, v2 REST) for the Übersetzer (idea 2.126). No API key: the function
// authenticates with its own service account (application default credentials), so the only setup is
// the Cloud Translation API enabled on the project.
//
// scope: 'shared'. A translation depends only on (text, source, target), never on who asks, so one
// cache entry serves everyone and carries no user or tenant link. The cache holds the translation,
// not the source text (the doc id is a hash of the params). TTL one day: repeated phrases are cheap
// without keeping what people typed for long. Text is never logged here or by the gateway.

import { applicationDefault } from 'firebase-admin/app';
import type { TranslatorLanguage } from '@okr/instruments-translator-util';
import type { Attribution, ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';

const BASE_URL = 'https://translation.googleapis.com/language/translate/v2';
const DAY = 24 * 60 * 60;

export const GOOGLE_TRANSLATE_ATTRIBUTION: Attribution = {
  provider: 'Google',
  url: 'https://cloud.google.com/translate',
};

let token: { value: string; expiresAtMs: number } | null = null;

/** OAuth token of the function's service account, reused until a minute before it expires. */
async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAtMs - 60_000) return token.value;
  const t = await applicationDefault().getAccessToken();
  token = { value: t.access_token, expiresAtMs: Date.now() + t.expires_in * 1000 };
  return token.value;
}

export interface TranslateParams {
  text: string;
  /** '' = detect. */
  source: string;
  target: string;
}

export interface TranslateRaw {
  translatedText: string;
  detectedSource: string | null;
}

interface V2TranslateBody {
  data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] };
}

/** Pure: the first translation of a v2 response; throws when there is none. */
export function parseTranslateResponse(body: V2TranslateBody): TranslateRaw {
  const t = body.data?.translations?.[0];
  if (!t || typeof t.translatedText !== 'string') throw new Error('google-translate: no translation in the response');
  return { translatedText: t.translatedText, detectedSource: t.detectedSourceLanguage ?? null };
}

export const googleTranslateAdapter: ProviderAdapter<TranslateParams, TranslateRaw, TranslateRaw> = {
  id: 'translate-google',
  baseUrl: BASE_URL,
  secrets: [],
  scope: 'shared',
  ttlSeconds: DAY,
  requiresAuth: true,
  // typing is debounced on the client; 30/min still lets a user work through a long text
  windowLimit: { limit: 30, windowMs: 60_000 },
  // ≤ 1000 characters per call → at most 10M characters (≈ USD 200) a month across all tenants
  monthlyCap: 10_000,
  attribution: GOOGLE_TRANSLATE_ATTRIBUTION,
  async fetch(params) {
    const res = await gatewayFetch<V2TranslateBody>(BASE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}` },
      data: { q: params.text, target: params.target, format: 'text', ...(params.source ? { source: params.source } : {}) },
      maxBytes: 256 * 1024,
    });
    return parseTranslateResponse(res.data);
  },
  map: (raw) => raw,
  sourceTimestamp: () => null,
};

export interface LanguagesParams {
  display: string;
}

interface V2LanguagesBody {
  data?: { languages?: { language?: string; name?: string }[] };
}

/** Pure: the language list of a v2 response; throws when it is empty. */
export function parseLanguagesResponse(body: V2LanguagesBody): TranslatorLanguage[] {
  const languages = (body.data?.languages ?? [])
    .filter((l): l is { language: string; name?: string } => typeof l.language === 'string')
    .map(l => ({ code: l.language, name: l.name ?? l.language }));
  if (languages.length === 0) throw new Error('google-translate: empty language list');
  return languages;
}

export const googleLanguagesAdapter: ProviderAdapter<LanguagesParams, TranslatorLanguage[], TranslatorLanguage[]> = {
  id: 'translate-google-languages',
  baseUrl: `${BASE_URL}/languages`,
  secrets: [],
  scope: 'shared',
  // the list changes a few times a year; one entry per display language
  ttlSeconds: 30 * DAY,
  requiresAuth: true,
  windowLimit: { limit: 10, windowMs: 60_000 },
  monthlyCap: 500,
  attribution: GOOGLE_TRANSLATE_ATTRIBUTION,
  async fetch(params) {
    const res = await gatewayFetch<V2LanguagesBody>(`${BASE_URL}/languages`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${await accessToken()}` },
      params: { target: params.display, model: 'nmt' },
      maxBytes: 256 * 1024,
    });
    return parseLanguagesResponse(res.data);
  },
  map: (raw) => raw,
  sourceTimestamp: () => null,
};
