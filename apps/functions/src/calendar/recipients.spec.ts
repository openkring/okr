import { describe, expect, it } from 'vitest';

import {
  reachableAttendeeKeys,
  caleventKeyFromFolders,
  caleventDeepLink,
  caleventKeyFromParent,
  shorten,
  CalEventNotifyDoc,
  collectRecipients,
  declinedAttendeeKeys,
  isFutureOrToday,
  responsibleKeys,
  COMMENT_NOTIFY_THRESHOLD,
  commentRecipients,
  versandLayout,
  resolveCommentNotify,
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

describe('caleventDeepLink', () => {
  it('targets the list route that opens the event — a bare /calevent/<okey> matches no route', () => {
    expect(caleventDeepLink('e1')).toBe('/calevent/my/c-calevents?event=e1');
  });
});

describe('resolveCommentNotify (spec 1.147)', () => {
  it('an explicit setting wins over Versand and size', () => {
    expect(resolveCommentNotify('all', true, 500)).toBe('all');
    expect(resolveCommentNotify('none', false, 2)).toBe('none');
    expect(resolveCommentNotify('organisers', false, 2)).toBe('organisers');
  });

  it('default on a Versand event tells the organisers only', () => {
    expect(resolveCommentNotify('default', true, 3)).toBe('organisers');
  });

  it('default switches to organisers above the threshold, not at it', () => {
    expect(COMMENT_NOTIFY_THRESHOLD).toBe(10);
    expect(resolveCommentNotify('default', false, 10)).toBe('all');
    expect(resolveCommentNotify('default', false, 11)).toBe('organisers');
  });

  it('a legacy document (no field) or an unknown value reads as default', () => {
    expect(resolveCommentNotify(undefined, false, 4)).toBe('all');
    expect(resolveCommentNotify('everyone', false, 40)).toBe('organisers');
  });
});

describe('versandLayout', () => {
  it('takes the layout of the newest Versand of the tenant', () => {
    expect(versandLayout([
      { tenants: ['scs'], createdAt: '20261108173142', layout: 'standard' },
      { tenants: ['scs'], createdAt: '20261108211434', layout: 'email-layout-logo_scs' },
      { tenants: ['other'], createdAt: '20261109000000', layout: 'plain' },
    ], 'scs')).toBe('email-layout-logo_scs');
  });

  it('is undefined without a Versand of the tenant, standard for one without a layout', () => {
    expect(versandLayout([{ tenants: ['other'], layout: 'plain' }], 'scs')).toBeUndefined();
    expect(versandLayout([{ tenants: ['scs'] }], 'scs')).toBe('standard');
  });
});

describe('commentRecipients', () => {
  const event = openEvent([['a', 'accepted'], ['b', 'invited'], ['c', 'declined'], ['org2', 'declined']], ['org1', 'org2', 'a']);

  it("'all' is collectRecipients: not declined plus organisers, minus the author", () => {
    expect(commentRecipients(event, 'all', ['b']).sort()).toEqual(['a', 'org1']);
  });

  it("'organisers' keeps only responsiblePersons, minus declined and the author", () => {
    expect(commentRecipients(event, 'organisers').sort()).toEqual(['a', 'org1']);
    expect(commentRecipients(event, 'organisers', ['org1'])).toEqual(['a']);
  });

  it("'none' and an archived event reach nobody", () => {
    expect(commentRecipients(event, 'none')).toEqual([]);
    expect(commentRecipients({ ...event, isArchived: true }, 'all')).toEqual([]);
  });
});
