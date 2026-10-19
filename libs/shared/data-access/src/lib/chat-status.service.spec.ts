import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '@okr/shared-config';

const h = vi.hoisted(() => ({
  setDoc: vi.fn(async () => undefined),
  next: undefined as ((s: unknown) => void) | undefined,
  error: undefined as ((e: unknown) => void) | undefined,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'app-status/chat' })),
  setDoc: h.setDoc,
  onSnapshot: vi.fn((_ref: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
    h.next = next;
    h.error = error;
    return () => undefined;
  }),
}));

import { ChatStatusService } from './chat-status.service';

function make(): ChatStatusService {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: FIRESTORE, useValue: {} },
    ],
  });
  return TestBed.inject(ChatStatusService);
}
const snap = (data: unknown) => ({ exists: () => data !== undefined, data: () => data });

describe('ChatStatusService', () => {
  beforeEach(() => {
    h.setDoc.mockClear();
    h.next = undefined;
    h.error = undefined;
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.useRealTimers());

  it('missing doc: not blocked, ready', () => {
    const s = make();
    s.blocked();
    h.next?.(snap(undefined));
    expect(s.blocked()).toBe(false);
    expect(s.ready()).toBe(true);
  });

  it('listener error: not blocked, ready', () => {
    const s = make();
    s.blocked();
    h.error?.(new Error('denied'));
    expect(s.blocked()).toBe(false);
    expect(s.ready()).toBe(true);
  });

  it('exempt person is not effectively blocked, others are', () => {
    const s = make();
    s.blocked();
    h.next?.(snap({ blocked: true, exempt: [{ personKey: 'p1', name: 'A' }] }));
    expect(s.blocked()).toBe(true);
    expect(s.isExempt('p1')).toBe(true);
    expect(s.isEffectivelyBlocked('p1')).toBe(false);
    expect(s.isEffectivelyBlocked('p2')).toBe(true);
  });

  it('block() merges exempt with the admin', async () => {
    const s = make();
    s.blocked();
    h.next?.(snap({ blocked: false, exempt: [{ personKey: 'p2', name: 'B' }] }));
    await s.block('Wartung', { personKey: 'p1', name: 'A' });
    const payload = (h.setDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload['exempt']).toEqual([{ personKey: 'p2', name: 'B' }, { personKey: 'p1', name: 'A' }]);
    expect(payload['blocked']).toBe(true);
    expect(payload['message']).toBe('Wartung');
    expect(payload['blockedBy']).toBe('p1');
    expect((h.setDoc.mock.calls[0] as unknown[])[2]).toEqual({ merge: true });
  });

  it('unblock() leaves exempt untouched', async () => {
    const s = make();
    await s.unblock('p1');
    const payload = (h.setDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload['blocked']).toBe(false);
    expect('exempt' in payload).toBe(false);
  });

  it('whenReady resolves after timeout without a snapshot', async () => {
    const s = make();
    await expect(s.whenReady(10)).resolves.toBeUndefined();
  });

  const payload = (): Record<string, unknown> => (h.setDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;

  it('block() without a snapshot waits for it and keeps existing exemptions', async () => {
    const s = make();
    const p = s.block('Wartung', { personKey: 'p1', name: 'A' });
    await Promise.resolve();
    expect(h.setDoc).not.toHaveBeenCalled();
    h.next?.(snap({ blocked: false, exempt: [{ personKey: 'p2', name: 'B' }] }));
    await p;
    expect(payload()['exempt']).toEqual([{ personKey: 'p2', name: 'B' }, { personKey: 'p1', name: 'A' }]);
  });

  it('block() throws instead of writing when no snapshot arrives', async () => {
    vi.useFakeTimers();
    const s = make();
    const p = s.block('Wartung', { personKey: 'p1', name: 'A' });
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3100);
    await assertion;
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('addExemption / removeExemption refuse after a listener error', async () => {
    const s = make();
    h.error?.(new Error('denied'));
    await expect(s.addExemption({ personKey: 'p1', name: 'A' }, 'adm')).rejects.toThrow();
    await expect(s.removeExemption('p1', 'adm')).rejects.toThrow();
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('resubscribes with backoff after an error', async () => {
    vi.useFakeTimers();
    const { onSnapshot } = await import('firebase/firestore');
    const s = make();
    const calls = vi.mocked(onSnapshot).mock.calls.length;
    h.error?.(new Error('denied'));
    expect(s.blocked()).toBe(false);
    expect(s.ready()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(onSnapshot).mock.calls.length).toBe(calls + 1);
    h.next?.(snap({ blocked: true, exempt: [] }));
    expect(s.blocked()).toBe(true);
  });

  it('updateMessage / addExemption / removeExemption payloads', async () => {
    const s = make();
    h.next?.(snap({ blocked: true, exempt: [{ personKey: 'p2', name: 'B' }] }));
    await s.updateMessage('neu', 'adm');
    expect(payload()).toMatchObject({ message: 'neu', updatedBy: 'adm' });
    expect('exempt' in payload()).toBe(false);
    h.setDoc.mockClear();
    await s.addExemption({ personKey: 'p3', name: 'C' }, 'adm');
    expect(payload()['exempt']).toEqual([{ personKey: 'p2', name: 'B' }, { personKey: 'p3', name: 'C' }]);
    h.setDoc.mockClear();
    await s.removeExemption('p2', 'adm');
    expect(payload()['exempt']).toEqual([]);
  });
});
