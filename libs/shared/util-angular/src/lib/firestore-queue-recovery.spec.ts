import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRESTORE_QUEUE_RELOAD_KEY,
  isFirestoreQueueFailure,
  isFirestoreQueueRecoveryInFlight,
  recoverFromFirestoreQueueFailure,
  registerFirestoreQueueRecovery,
} from './firestore-queue-recovery';

const captureMessage = vi.fn();
const flush = vi.fn((_timeout?: number) => Promise.resolve(true));
vi.mock('@sentry/angular', () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  flush: (timeout?: number) => flush(timeout),
}));

/** The real SCS-4P event: the b815 assertion carrying the underlying fault in its CONTEXT. */
const B815 =
  'FIRESTORE (12.16.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) CONTEXT: ' +
  '{"el":"TypeError: Cannot read properties of null (reading \'isCorePipeline\')"}';

describe('isFirestoreQueueFailure', () => {
  it('matches the b815 assertion that means the queue is dead', () => {
    expect(isFirestoreQueueFailure(new Error(B815))).toBe(true);
    expect(isFirestoreQueueFailure(B815)).toBe(true);
  });

  it('matches other Firestore internal assertions and other SDK versions', () => {
    // The underlying fault differs per incident; the assertion is the reliable signal.
    expect(isFirestoreQueueFailure(new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)'))).toBe(true);
    expect(isFirestoreQueueFailure({ message: 'FIRESTORE (11.0.1) INTERNAL ASSERTION FAILED: x' })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    // The bare TypeError is NOT a queue failure — it is the cause, and the SDK swallows it
    // into the assertion's CONTEXT. Reloading on it alone would fire on unrelated null reads.
    expect(isFirestoreQueueFailure(new Error("Cannot read properties of null (reading 'isCorePipeline')"))).toBe(false);
    expect(isFirestoreQueueFailure(new Error('Missing or insufficient permissions.'))).toBe(false);
    expect(isFirestoreQueueFailure(null)).toBe(false);
    expect(isFirestoreQueueFailure(undefined)).toBe(false);
    expect(isFirestoreQueueFailure({})).toBe(false);
  });
});

describe('recoverFromFirestoreQueueFailure', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    captureMessage.mockClear();
    flush.mockClear();
    // jsdom's location.reload is a non-configurable no-op; swap it for a spy.
    Object.defineProperty(window, 'location', { value: { reload, href: 'https://app.seeclub.org/public/welcome' }, writable: true, configurable: true });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reports the failure and reloads once', async () => {
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(true);
    expect(captureMessage).toHaveBeenCalledOnce();
    // The assertion text is kept verbatim — it is the only place the real cause appears.
    expect(captureMessage.mock.calls[0][1].extra.assertion).toContain('isCorePipeline');
    expect(sessionStorage.getItem(FIRESTORE_QUEUE_RELOAD_KEY)).not.toBeNull();
    // The reload waits for the flush so the report is not lost with the page.
    expect(reload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('suppresses the flood: the queue keeps asserting until the page is gone', async () => {
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(true);
    // Every later assertion in the same incident is a duplicate of one already reported.
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(false);
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(false);
    expect(captureMessage).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('sets the in-flight flag so beforeSend can drop the raw assertions', () => {
    recoverFromFirestoreQueueFailure(new Error(B815));
    expect(isFirestoreQueueRecoveryInFlight()).toBe(true);
  });

  it('does not reload for unrelated errors', () => {
    expect(recoverFromFirestoreQueueFailure(new Error('Missing or insufficient permissions.'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('stays reportable when the queue fails again right after a reload', () => {
    // A recent reload means reloading did not fix it — a genuinely broken state, not a
    // recoverable one. Do not loop the page, and let the event reach Sentry.
    sessionStorage.setItem(FIRESTORE_QUEUE_RELOAD_KEY, String(Date.now()));
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the guard window has passed', async () => {
    sessionStorage.setItem(FIRESTORE_QUEUE_RELOAD_KEY, String(Date.now() - 61_000));
    expect(recoverFromFirestoreQueueFailure(new Error(B815))).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});

describe('registerFirestoreQueueRecovery', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, 'location', { value: { reload, href: 'https://app.seeclub.org/' }, writable: true, configurable: true });
  });

  it('recovers from the global error event the assertion actually arrives on', async () => {
    registerFirestoreQueueRecovery();
    // SCS-4P's events all carry mechanism auto.browser.global_handlers.onerror.
    window.dispatchEvent(new ErrorEvent('error', { error: new Error(B815), message: B815 }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
