import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
