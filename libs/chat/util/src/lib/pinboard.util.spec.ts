import { describe, expect, it } from 'vitest';
import { pinboardBroadcastCount, pinboardReplyDraft } from './pinboard.util';

describe('pinboardReplyDraft', () => {
  const prefix = 'Zu deinem Aushang «{excerpt}»: ';
  it('quotes a short notice whole', () => expect(pinboardReplyDraft('Velo zu verkaufen', prefix)).toBe('Zu deinem Aushang «Velo zu verkaufen»: '));
  it('cuts after 60 characters with an ellipsis', () => {
    const body = 'a'.repeat(70);
    expect(pinboardReplyDraft(body, prefix)).toBe(`Zu deinem Aushang «${'a'.repeat(60)}…»: `);
  });
  it('flattens line breaks', () => expect(pinboardReplyDraft('Brille\ngefunden', prefix)).toBe('Zu deinem Aushang «Brille gefunden»: '));
  it('does not interpret $ patterns in the body', () => expect(pinboardReplyDraft('Velo $& Helm', prefix)).toBe('Zu deinem Aushang «Velo $& Helm»: '));
  it('falls back to the prefix without quote for an empty body', () => expect(pinboardReplyDraft('  ', prefix)).toBe('Zu deinem Aushang «»: '));
});

describe('pinboardBroadcastCount', () => {
  it('counts members without the sender', () => expect(pinboardBroadcastCount(['anna', 'beat', 'carl'], 'anna')).toBe(2));
  it('is case-insensitive on keys', () => expect(pinboardBroadcastCount(['Anna', 'beat'], 'anna')).toBe(1));
  it('never goes below zero', () => expect(pinboardBroadcastCount([], 'anna')).toBe(0));
  it('counts only known persons when knownKeys is given (drops the admin service account)', () => {
    expect(pinboardBroadcastCount(['anna', 'Beat', 'carl', 'matrixadmin'], 'anna', new Set(['anna', 'beat', 'carl']))).toBe(2);
  });
  it('counts every known member when there is no sender', () => {
    expect(pinboardBroadcastCount(['anna', 'beat', 'matrixadmin'], '', new Set(['anna', 'beat']))).toBe(2);
  });
});
