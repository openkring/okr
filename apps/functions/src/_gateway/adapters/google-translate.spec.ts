// apps/functions/src/_gateway/adapters/google-translate.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../http', () => ({ gatewayFetch: vi.fn() }));
vi.mock('firebase-admin/app', () => ({
  applicationDefault: () => ({ getAccessToken: async () => ({ access_token: 'tok', expires_in: 3600 }) }),
}));
import { gatewayFetch } from '../http';
import { googleLanguagesAdapter, googleTranslateAdapter, parseLanguagesResponse, parseTranslateResponse } from './google-translate';

const CTX = { tenantId: '', uid: 'u', isAdmin: false };

describe('googleTranslateAdapter', () => {
  beforeEach(() => vi.mocked(gatewayFetch).mockReset());

  it('is a shared adapter without secrets and a one-day TTL', () => {
    expect(googleTranslateAdapter.scope).toBe('shared');
    expect(googleTranslateAdapter.secrets).toEqual([]);
    expect(googleTranslateAdapter.ttlSeconds).toBe(24 * 60 * 60);
  });

  it('posts the text with the service-account token and omits source for detection', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue({ data: { data: { translations: [{ translatedText: 'Hello', detectedSourceLanguage: 'de' }] } } } as never);
    const raw = await googleTranslateAdapter.fetch({ text: 'Hallo', source: '', target: 'en' }, CTX);
    expect(raw).toEqual({ translatedText: 'Hello', detectedSource: 'de' });
    const [, opts] = vi.mocked(gatewayFetch).mock.calls[0];
    expect(opts?.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(opts?.data).toEqual({ q: 'Hallo', target: 'en', format: 'text' });
  });

  it('sends a fixed source language', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue({ data: { data: { translations: [{ translatedText: 'Bonjour' }] } } } as never);
    await googleTranslateAdapter.fetch({ text: 'Hallo', source: 'de', target: 'fr' }, CTX);
    expect(vi.mocked(gatewayFetch).mock.calls[0][1]?.data).toEqual({ q: 'Hallo', target: 'fr', format: 'text', source: 'de' });
  });
});

describe('parseTranslateResponse', () => {
  it('throws without a translation', () => {
    expect(() => parseTranslateResponse({})).toThrow(/no translation/);
    expect(() => parseTranslateResponse({ data: { translations: [] } })).toThrow(/no translation/);
  });
  it('has no detection for a fixed source', () => {
    expect(parseTranslateResponse({ data: { translations: [{ translatedText: 'x' }] } })).toEqual({ translatedText: 'x', detectedSource: null });
  });
});

describe('googleLanguagesAdapter', () => {
  beforeEach(() => vi.mocked(gatewayFetch).mockReset());

  it('asks for names in the display language', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue({ data: { data: { languages: [{ language: 'en', name: 'Englisch' }] } } } as never);
    const raw = await googleLanguagesAdapter.fetch({ display: 'de' }, CTX);
    expect(raw).toEqual([{ code: 'en', name: 'Englisch' }]);
    expect(vi.mocked(gatewayFetch).mock.calls[0][1]?.params).toEqual({ target: 'de', model: 'nmt' });
  });

  it('throws on an empty list, so a cached list stays', () => {
    expect(() => parseLanguagesResponse({ data: { languages: [] } })).toThrow(/empty/);
  });

  it('falls back to the code when a name is missing', () => {
    expect(parseLanguagesResponse({ data: { languages: [{ language: 'haw' }, { name: 'no code' }] } })).toEqual([{ code: 'haw', name: 'haw' }]);
  });
});
