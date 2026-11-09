import { describe, expect, it } from 'vitest';
import { isSwissAddress, letterShare, nextSendingState, SENDING_FINAL, shouldHoldVersand } from './postversand.util';

describe('nextSendingState', () => {
  it('moves forward', () => {
    expect(nextSendingState('submitted', 'sent', false)).toBe('sent');
    expect(nextSendingState('sent', 'delivered', false)).toBe('delivered');
    expect(nextSendingState('sent', 'undeliverable', false)).toBe('undeliverable');
  });
  it('fails on a rejected issue', () => {
    expect(nextSendingState('submitted', 'issues', true)).toBe('failed');
  });
  it('keeps an unrejected issue as history only', () => {
    expect(nextSendingState('submitted', 'issues', false)).toBeUndefined();
  });
  it('moves forward from queued and fails only before the post took it', () => {
    expect(nextSendingState('queued', 'sent', false)).toBe('sent');
    expect(nextSendingState('queued', 'issues', true)).toBe('failed');
    expect(nextSendingState('submitted', 'undeliverable', false)).toBeUndefined();
    expect(nextSendingState('sent', 'issues', true)).toBeUndefined();
  });
  it('never moves backwards or out of a terminal state', () => {
    expect(nextSendingState('delivered', 'sent', false)).toBeUndefined();
    expect(nextSendingState('failed', 'sent', false)).toBeUndefined();
    expect(nextSendingState('undeliverable', 'delivered', false)).toBeUndefined();
    expect(nextSendingState('sent', 'sent', false)).toBeUndefined();
  });
});

describe('isSwissAddress', () => {
  it('treats CH, ch and a missing code as Swiss', () => {
    expect(isSwissAddress('CH')).toBe(true);
    expect(isSwissAddress('ch')).toBe(true);
    expect(isSwissAddress(undefined)).toBe(true);
    expect(isSwissAddress('')).toBe(true);
  });
  it('rejects foreign codes', () => {
    expect(isSwissAddress('DE')).toBe(false);
  });
});

describe('shouldHoldVersand', () => {
  it('holds from three address issues', () => {
    expect(shouldHoldVersand(2)).toBe(false);
    expect(shouldHoldVersand(3)).toBe(true);
  });
});

describe('letterShare / SENDING_FINAL', () => {
  it('counts one unit and the pages', () => {
    expect(letterShare(3)).toEqual({ units: 1, pages: 3 });
  });
  it('lists the final states', () => {
    expect(SENDING_FINAL).toEqual(['sent', 'delivered', 'failed', 'undeliverable']);
  });
});
