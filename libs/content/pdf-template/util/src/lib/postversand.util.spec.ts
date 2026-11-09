import { describe, expect, it } from 'vitest';
import { formatChf, isSwissAddress, postCostLines, letterShare, nextSendingState, SENDING_FINAL, shouldHoldVersand } from './postversand.util';

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
  it('orders submitting between queued and submitted', () => {
    expect(nextSendingState('submitting', 'sent', false)).toBe('sent');
    expect(nextSendingState('submitting', 'issues', true)).toBe('failed');
    expect(nextSendingState('submitting', 'undeliverable', false)).toBeUndefined();
    expect(nextSendingState('submitted', 'issues', true)).toBe('failed');
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

describe('formatChf', () => {
  it('shows Rappen as CHF with two decimals', () => {
    expect(formatChf(120)).toBe('CHF 1.20');
    expect(formatChf(5)).toBe('CHF 0.05');
    expect(formatChf(0)).toBe('CHF 0.00');
    expect(formatChf(8820)).toBe('CHF 88.20');
  });
});

describe('postCostLines', () => {
  it('prices the letters and the pages from the pricing table', () => {
    expect(postCostLines(42, 126)).toEqual({
      letterPrice: 'CHF 1.20', letterTotal: 'CHF 50.40', pagePrice: 'CHF 0.30', pageTotal: 'CHF 37.80',
    });
  });
});
