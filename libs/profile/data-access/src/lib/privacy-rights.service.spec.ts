import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The callable transport is module-level (`getFunctions(getApp(), …)`), exactly like
 * `ZefixService` and `PersonService.loadSensitive`. Mocking the firebase modules is
 * therefore the only seam — and it is the seam that matters here, because what this
 * service adds over a raw `httpsCallable` is entirely about WHICH name it calls, WHAT it
 * forwards, and how it turns a thrown `HttpsError` into something the modal can render.
 */
const callable = vi.fn();
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fns: unknown, name: string) => (payload: unknown) => callable(name, payload),
}));

const { PrivacyRightsService } = await import('./privacy-rights.service');

/** A thrown FunctionsError as the Firebase SDK surfaces it on the client. */
function functionsError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code, name: 'FirebaseError' });
}

describe('PrivacyRightsService', () => {
  let service: InstanceType<typeof PrivacyRightsService>;

  beforeEach(() => {
    callable.mockReset();
    service = new PrivacyRightsService();
  });

  describe('exportMyData', () => {
    it('calls the exportMyData callable with no arguments — no subject can be named', async () => {
      callable.mockResolvedValue({ data: { downloadUrl: 'https://x/y.zip', expiresAt: 'e', sizeBytes: 12 } });
      const result = await service.exportMyData();
      expect(callable).toHaveBeenCalledWith('exportMyData', undefined);
      expect(result.ok && result.value.downloadUrl).toBe('https://x/y.zip');
    });

    it('surfaces the rate limit as a typed failure carrying the German message', async () => {
      callable.mockRejectedValue(functionsError(
        'functions/resource-exhausted',
        'Ein Datenexport ist einmal pro Stunde möglich. Bitte versuche es später noch einmal.',
      ));
      const result = await service.exportMyData();
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe('resource-exhausted');
      expect(!result.ok && result.message).toMatch(/einmal pro Stunde/);
    });
  });

  describe('previewErasure', () => {
    it('calls previewMyErasure', async () => {
      callable.mockResolvedValue({ data: { blockers: [], willDelete: [], previewToken: 'tok' } });
      const result = await service.previewErasure();
      expect(callable).toHaveBeenCalledWith('previewMyErasure', undefined);
      expect(result.ok && result.value.previewToken).toBe('tok');
    });
  });

  describe('eraseMyData', () => {
    it('forwards the preview token', async () => {
      callable.mockResolvedValue({ data: { executedAt: '2026', pseudonym: 'p', counts: {} } });
      await service.eraseMyData('tok-42');
      expect(callable).toHaveBeenCalledWith('eraseMyData', { previewToken: 'tok-42' });
    });

    // The whole point of the typed result: `failed-precondition` is the normal, expected
    // answer when the report moved between preview and confirmation, and the modal has to
    // render the server's German sentence. A raw throw would surface as a stack trace.
    it('surfaces a stale-token rejection as a typed failure, not a throw', async () => {
      callable.mockRejectedValue(functionsError(
        'functions/failed-precondition',
        'Die Übersicht hat sich geändert. Bitte prüfe sie noch einmal.',
      ));
      const result = await service.eraseMyData('tok-stale');
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe('failed-precondition');
      expect(!result.ok && result.message).toMatch(/noch einmal/);
    });

    it('keeps a blocker rejection readable too', async () => {
      callable.mockRejectedValue(functionsError('functions/failed-precondition', 'Es bestehen noch offene Punkte.'));
      const result = await service.eraseMyData('tok');
      expect(!result.ok && result.message).toBe('Es bestehen noch offene Punkte.');
    });
  });

  describe('failure mapping', () => {
    it('falls back to a German sentence when the error carries no message', async () => {
      callable.mockRejectedValue(functionsError('functions/internal', ''));
      const result = await service.exportMyData();
      expect(!result.ok && result.message.length).toBeGreaterThan(10);
      expect(!result.ok && result.message).toMatch(/[äöüÄÖÜß]|nicht|Fehler/);
    });

    it('handles a non-Firebase throw without inventing a code', async () => {
      callable.mockRejectedValue(new Error('network down'));
      const result = await service.exportMyData();
      expect(!result.ok && result.code).toBe('unknown');
    });

    // A raw 'functions/'-prefixed code would leak into i18n keys and comparisons.
    it('strips the functions/ prefix the SDK adds', async () => {
      callable.mockRejectedValue(functionsError('functions/permission-denied', 'nope'));
      const result = await service.exportMyData();
      expect(!result.ok && result.code).toBe('permission-denied');
    });
  });
});
