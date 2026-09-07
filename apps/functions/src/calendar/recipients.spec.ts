import { describe, expect, it } from 'vitest';

import {
  reachableAttendeeKeys,
  caleventKeyFromFolders,
  caleventKeyFromParent,
  hasTag,
  shorten,
  CalEventNotifyDoc,
  collectRecipients,
  declinedAttendeeKeys,
  isFutureOrToday,
  responsibleKeys,
} from './recipients';

const openEvent = (attendees: [string, string][], responsible: string[] = []): CalEventNotifyDoc => ({
  okey: 'e1',
  attendees: attendees.map(([key, state]) => ({ person: { key }, state })),
  responsiblePersons: responsible.map((key) => ({ key })),
});

describe('reachableAttendeeKeys', () => {
  it('reaches everybody who has not declined — accepted AND still-unanswered', () => {
    const event = openEvent([['a', 'accepted'], ['b', 'invited'], ['c', 'declined']]);
    expect(reachableAttendeeKeys(event).sort()).toEqual(['a', 'b']);
  });

  it('keeps an invited guest who has not answered yet', () => {
    // the regression this guards: with 'accepted only', the guest who never answered would miss
    // the cancellation — exactly the person most likely to turn up unaware
    expect(reachableAttendeeKeys(openEvent([['guest', 'invited']]))).toEqual(['guest']);
  });

  it('skips an attendee without a person key', () => {
    expect(reachableAttendeeKeys({ okey: 'e1', attendees: [{ state: 'accepted' }] })).toEqual([]);
  });

  it('copes with a legacy event that has no attendees', () => {
    expect(reachableAttendeeKeys({ okey: 'e1' })).toEqual([]);
  });
});

describe('declinedAttendeeKeys', () => {
  it('keeps only the declined', () => {
    const event = openEvent([['a', 'accepted'], ['b', 'declined']]);
    expect(declinedAttendeeKeys(event)).toEqual(['b']);
  });
});

describe('responsibleKeys', () => {
  it('reads the organisers', () => {
    expect(responsibleKeys(openEvent([], ['org1', 'org2']))).toEqual(['org1', 'org2']);
  });
});

describe('collectRecipients', () => {
  it('notifies everybody on the event who has not declined, plus the organisers', () => {
    const event = openEvent([['a', 'accepted'], ['b', 'invited']], ['org1']);
    expect(collectRecipients([event]).sort()).toEqual(['a', 'b', 'org1']);
  });

  it('never notifies someone who declined, even when they are an organiser', () => {
    const event = openEvent([['org1', 'declined'], ['a', 'accepted']], ['org1']);
    expect(collectRecipients([event])).toEqual(['a']);
  });

  it('excludes the sender', () => {
    const event = openEvent([['a', 'accepted'], ['b', 'accepted']]);
    expect(collectRecipients([event], ['a'])).toEqual(['b']);
  });

  it('does not notify a member who never answered — they are not on the event', () => {
    const event = openEvent([['a', 'accepted']], ['org1']);
    expect(collectRecipients([event]).sort()).toEqual(['a', 'org1']);
  });

  it('skips an archived event entirely', () => {
    const event = { ...openEvent([['a', 'accepted']]), isArchived: true };
    expect(collectRecipients([event])).toEqual([]);
  });
});

describe('collectRecipients — series scope', () => {
  it('unions the occurrences without notifying anyone twice', () => {
    const first = { ...openEvent([['a', 'accepted'], ['b', 'accepted']]), okey: 'e1' };
    const second = { ...openEvent([['b', 'accepted'], ['c', 'accepted']]), okey: 'e2' };
    expect(collectRecipients([first, second]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a decline on one occurrence removes the person from the whole broadcast', () => {
    const first = { ...openEvent([['a', 'accepted'], ['b', 'accepted']]), okey: 'e1' };
    const second = { ...openEvent([['b', 'declined']]), okey: 'e2' };
    expect(collectRecipients([first, second])).toEqual(['a']);
  });
});

describe('isFutureOrToday', () => {
  it('keeps today and later, drops the past', () => {
    expect(isFutureOrToday('20260825', '20260825')).toBe(true);
    expect(isFutureOrToday('20260826', '20260825')).toBe(true);
    expect(isFutureOrToday('20260824', '20260825')).toBe(false);
  });
});

describe('caleventKeyFromParent', () => {
  it('reads the key behind the calevent prefix', () => {
    expect(caleventKeyFromParent('calevent.abc123')).toBe('abc123');
  });

  it('ignores a parent of another model', () => {
    expect(caleventKeyFromParent('person.abc123')).toBe('');
    expect(caleventKeyFromParent('invitation.abc123')).toBe('');
  });

  it('tolerates a missing parent key', () => {
    expect(caleventKeyFromParent(undefined)).toBe('');
  });
});

describe('caleventKeyFromFolders', () => {
  it('finds the calevent folder among others', () => {
    expect(caleventKeyFromFolders(['f:other', 'calevent.abc123'])).toBe('abc123');
  });

  it('returns empty when the document hangs elsewhere', () => {
    expect(caleventKeyFromFolders(['person.x', 'org.y'])).toBe('');
    expect(caleventKeyFromFolders(undefined)).toBe('');
  });
});

describe('hasTag', () => {
  it('matches a whole tag, not a prefix', () => {
    expect(hasTag('broadcast', 'broadcast')).toBe(true);
    expect(hasTag('urgent, broadcast', 'broadcast')).toBe(true);
    expect(hasTag('broadcaster', 'broadcast')).toBe(false);
  });

  it('is false for no tags at all', () => {
    expect(hasTag(undefined, 'broadcast')).toBe(false);
    expect(hasTag('', 'broadcast')).toBe(false);
  });
});

describe('shorten', () => {
  it('leaves a short text alone', () => {
    expect(shorten('Training faellt aus', 120)).toBe('Training faellt aus');
  });

  it('collapses whitespace and newlines', () => {
    expect(shorten('Training\n\n  faellt   aus')).toBe('Training faellt aus');
  });

  it('truncates with an ellipsis at the limit', () => {
    expect(shorten('abcdefghij', 5)).toBe('abcd…');
    expect(shorten('abcdefghij', 5).length).toBe(5);
  });

  it('tolerates undefined', () => {
    expect(shorten(undefined)).toBe('');
  });
});
