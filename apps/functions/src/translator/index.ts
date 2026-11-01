import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import {
  AUTO_DETECT, isLangCode, LanguagesRes, TRANSLATOR_MAX_TEXT, TranslateRes,
} from '@okr/instruments-translator-util';
import { makeOpRouter, type OpHandler } from '../_router';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import {
  googleLanguagesAdapter, googleTranslateAdapter, LanguagesParams, TranslateParams,
} from '../_gateway/adapters/google-translate';

/** Shared adapters: the tenant is never part of a cache key, so it is not resolved (saves a read). */
function contextOf(request: CallableRequest<unknown>): GatewayContext {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  const token = request.auth.token as Record<string, unknown> | undefined;
  return {
    tenantId: '',
    uid: request.auth.uid,
    isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
  };
}

/** The checked translate params; the text is trimmed so «Hallo» and «Hallo » share one cache entry. */
export function validTranslateParams(data: unknown): TranslateParams {
  const d = (data ?? {}) as Record<string, unknown>;
  const text = typeof d['text'] === 'string' ? d['text'].trim() : '';
  if (text.length === 0 || text.length > TRANSLATOR_MAX_TEXT) {
    throw new HttpsError('invalid-argument', `text: 1–${TRANSLATOR_MAX_TEXT} characters expected`);
  }
  const source = d['source'] ?? AUTO_DETECT;
  if (source !== AUTO_DETECT && !isLangCode(source)) throw new HttpsError('invalid-argument', 'source: language code expected');
  const target = d['target'];
  if (!isLangCode(target)) throw new HttpsError('invalid-argument', 'target: language code expected');
  return { text, source: source as string, target };
}

export function validLanguagesParams(data: unknown): LanguagesParams {
  const display = ((data ?? {}) as Record<string, unknown>)['display'];
  if (!isLangCode(display)) throw new HttpsError('invalid-argument', 'display: language code expected');
  return { display };
}

export const TRANSLATOR_OPS: Record<string, OpHandler> = {
  translate: async (request): Promise<TranslateRes> => {
    const ctx = contextOf(request);
    const params = validTranslateParams(request.data);
    // same language on both sides: nothing to pay for
    if (params.source === params.target) {
      return { translatedText: params.text, detectedSource: null, attribution: { ...googleTranslateAdapter.attribution } };
    }
    const res = await runGateway(googleTranslateAdapter, params, ctx);
    return {
      translatedText: res.data.translatedText,
      detectedSource: params.source === AUTO_DETECT ? res.data.detectedSource : null,
      attribution: { provider: res.attribution.provider, url: res.attribution.url },
    };
  },
  languages: async (request): Promise<LanguagesRes> => {
    const ctx = contextOf(request);
    const res = await runGateway(googleLanguagesAdapter, validLanguagesParams(request.data), ctx);
    return { languages: res.data };
  },
};

/**
 * The Übersetzer (idea 2.126): one callable, ops `translate` and `languages`, both over Google Cloud
 * Translation through the gateway (cache, per-user window, monthly cap, retry, timeout). No secret —
 * the service account authenticates. The text is never logged.
 */
export const translator = makeOpRouter('translator', { region: 'europe-west6', enforceAppCheck: true }, TRANSLATOR_OPS);
