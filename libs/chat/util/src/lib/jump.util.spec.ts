import { describe, expect, it } from 'vitest';

import { isMessageGoneError, shouldSendReceipt, threadRootOf } from './jump.util';

describe('shouldSendReceipt', () => {
  it('sends no receipt while a jumped timeline is on screen', () => {
    expect(shouldSendReceipt(true, false)).toBe(false);
  });

  it('sends a receipt once the jumped timeline has reached the live end', () => {
    expect(shouldSendReceipt(true, true)).toBe(true);
  });

  it('sends a receipt on the live timeline', () => {
    expect(shouldSendReceipt(false, false)).toBe(true);
    expect(shouldSendReceipt(false, true)).toBe(true);
  });
});

describe('threadRootOf', () => {
  it('returns the root of a thread reply', () => {
    expect(threadRootOf({ body: 'x', 'm.relates_to': { rel_type: 'm.thread', event_id: '$root' } })).toBe('$root');
  });

  it('ignores replies, edits and plain messages', () => {
    expect(threadRootOf({ 'm.relates_to': { 'm.in_reply_to': { event_id: '$a' } } })).toBeUndefined();
    expect(threadRootOf({ 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' } })).toBeUndefined();
    expect(threadRootOf({ body: 'x' })).toBeUndefined();
    expect(threadRootOf(undefined)).toBeUndefined();
  });

  it('ignores a thread relation without a root id', () => {
    expect(threadRootOf({ 'm.relates_to': { rel_type: 'm.thread' } })).toBeUndefined();
  });
});

describe('isMessageGoneError', () => {
  it('is true for a deleted or unreadable event', () => {
    expect(isMessageGoneError({ errcode: 'M_NOT_FOUND' })).toBe(true);
    expect(isMessageGoneError({ errcode: 'M_FORBIDDEN' })).toBe(true);
  });

  it('is false for transient or unknown failures', () => {
    expect(isMessageGoneError({ errcode: 'M_LIMIT_EXCEEDED' })).toBe(false);
    expect(isMessageGoneError(new Error('network'))).toBe(false);
    expect(isMessageGoneError(undefined)).toBe(false);
  });
});
