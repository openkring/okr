import { describe, expect, it } from 'vitest';
import { CalEventModel, DeliveryChannel } from '@okr/shared-models';
import { MailingHousehold } from '@okr/shared-util-core';
import {
  applyHouseholds, buildVersandRows, deliveryTotals, emailOnlyDeliveries, hasPostDelivery, GROUP_ADMIN_MAILING_CHANNELS, isDeliveryEditable, nonPdfAttachmentNames, toggleDelivery, unreachableCount,
  versandBcc, versandDeliveries, groupReachWarnings, sharedEmailCount, untickEmailAddress, VersandEvent, versandEventsOf, versandEventWhen,
} from './versand.util';

const anna = { personKey: 'a', name: 'Anna', email: 'anna@x.ch' };
const beat = { personKey: 'b', name: 'Beat', email: '' };

describe('buildVersandRows', () => {
  it('ticks only the active channels of the profile choice', () => {
    const { rows, deliveries } = buildVersandRows([anna, beat], [
      { personKey: 'a', possible: [DeliveryChannel.Chat, DeliveryChannel.Email], initial: [DeliveryChannel.Chat, DeliveryChannel.Email] },
      { personKey: 'b', possible: [DeliveryChannel.Post], initial: [DeliveryChannel.Post] },
    ]);
    expect(rows.map((r) => r.possible)).toEqual([['chat', 'email'], ['post']]);
    expect(deliveries).toEqual({ a: ['chat', 'email'], b: ['post'] });
  });

  it('leaves out a person the server did not answer for', () => {
    expect(buildVersandRows([anna, beat], [{ personKey: 'a', possible: ['email' as DeliveryChannel], initial: [] }]).rows.map((r) => r.personKey)).toEqual(['a']);
  });

  it('falls back to email by address when the call failed', () => {
    const { rows, deliveries } = buildVersandRows([anna, beat], undefined);
    expect(rows.map((r) => r.possible)).toEqual([['email'], []]);
    expect(deliveries).toEqual({ a: ['email'], b: [] });
  });
});

describe('toggleDelivery', () => {
  const row = { ...anna, possible: [DeliveryChannel.Chat, DeliveryChannel.Email] };

  it('flips an editable cell', () => {
    expect(toggleDelivery({ a: [] }, row, DeliveryChannel.Email)).toEqual({ a: ['email'] });
    expect(toggleDelivery({ a: [DeliveryChannel.Email] }, row, DeliveryChannel.Email)).toEqual({ a: [] });
  });

  it('ignores a channel that is not possible, or not allowed for the sender', () => {
    const before = { a: [] };
    expect(toggleDelivery(before, row, DeliveryChannel.Post)).toBe(before);
    expect(toggleDelivery(before, { ...row, possible: [DeliveryChannel.Post] }, DeliveryChannel.Post, GROUP_ADMIN_MAILING_CHANNELS)).toBe(before);
    expect(toggleDelivery(before, { ...row, possible: [DeliveryChannel.Post] }, DeliveryChannel.Post)).toEqual({ a: ['post'] });
    expect(isDeliveryEditable({ ...row, possible: [] }, DeliveryChannel.Email)).toBe(false);
  });
});

describe('totals, unreachable and bcc', () => {
  const rows = [
    { ...anna, possible: [DeliveryChannel.Email] },
    { ...beat, possible: [] },
    { personKey: 'c', name: 'C', email: 'ANNA@x.ch', possible: [DeliveryChannel.Email] },
  ];
  const deliveries = { a: [DeliveryChannel.Email], b: [], c: [DeliveryChannel.Email] };

  it('counts per channel and the unreached', () => {
    expect(deliveryTotals(deliveries).email).toBe(2);
    expect(unreachableCount(rows, deliveries)).toBe(1);
  });

  it('builds a deduplicated bcc', () => {
    expect(versandBcc(rows, deliveries)).toEqual(['anna@x.ch']);
  });
});

describe('versandDeliveries', () => {
  it('lists the ticks per person and leaves out the unticked', () => {
    const rows = [
      { ...anna, possible: [DeliveryChannel.Chat, DeliveryChannel.Email] },
      { ...beat, possible: [] },
    ];
    expect(versandDeliveries(rows, { a: [DeliveryChannel.Chat], b: [] })).toEqual([{ personKey: 'a', channels: ['chat'] }]);
  });
});

describe('groupReachWarnings', () => {
  const cup: VersandEvent = { caleventKey: 'e1', name: 'Cup', when: '01.12.2026', groupKeys: ['g1'] };
  const open: VersandEvent = { caleventKey: 'e2', name: 'Fest', when: '02.12.2026' };

  it('groupReachWarnings counts only non-members', () => {
    expect(groupReachWarnings([cup], ['a', 'b', 'c'], { g1: ['a'] })).toEqual([{ caleventKey: 'e1', eventName: 'Cup', count: 2 }]);
  });

  it('groupReachWarnings skips events without groups', () => {
    expect(groupReachWarnings([open], ['a', 'b'], {})).toEqual([]);
  });

  it('groupReachWarnings counts a member of any of the event\'s groups as reached', () => {
    const two: VersandEvent = { ...cup, groupKeys: ['g1', 'g2'] };
    expect(groupReachWarnings([two], ['a', 'b', 'c'], { g1: ['a'], g2: ['b'] })).toEqual([{ caleventKey: 'e1', eventName: 'Cup', count: 1 }]);
  });

  it('groupReachWarnings drops a zero count', () => {
    expect(groupReachWarnings([cup], ['a'], { g1: ['a', 'z'] })).toEqual([]);
  });
});

describe('versandEventsOf', () => {
  const today = '20261107';
  const ev = (over: Partial<CalEventModel>): CalEventModel =>
    ({ okey: 'e', name: 'GV', startDate: '20261201', startTime: '19:30', calendars: ['scs'], state: 'planned', ...over }) as CalEventModel;
  const calendars = [{ okey: 'scs', owner: 'org.scs' }, { okey: 'u14', owner: 'group.g14' }, { okey: 'u16', owner: 'group.g16' }];
  const keys = (events: CalEventModel[]) => versandEventsOf(events, calendars, today).map((e) => e.caleventKey);

  it('keeps a club event, with the mail\'s date text and no group', () => {
    expect(versandEventsOf([ev({})], calendars, today)).toEqual([{ caleventKey: 'e', name: 'GV', when: '01.12.2026, 19:30' }]);
  });

  it('leaves out a personal event (no calendar)', () => {
    expect(keys([ev({ calendars: [] }), ev({ calendars: undefined })])).toEqual([]);
  });

  it('leaves out locked, cancelled, archived and poll (proposed) events', () => {
    expect(keys([ev({ isLocked: true }), ev({ state: 'cancelled' }), ev({ isArchived: true }), ev({ state: 'proposed' })])).toEqual([]);
  });

  it('keeps today up to six months ahead, nothing before or beyond', () => {
    expect(keys([
      ev({ okey: 'past', startDate: '20261106' }), ev({ okey: 'today', startDate: today }),
      ev({ okey: 'edge', startDate: '20270507' }), ev({ okey: 'beyond', startDate: '20270508' }),
    ])).toEqual(['today', 'edge']);
  });

  it('takes the groups from group-owned calendars', () => {
    expect(versandEventsOf([ev({ calendars: ['u14', 'u16'] })], calendars, today)[0].groupKeys).toEqual(['g14', 'g16']);
  });

  it('has no groups when the event is also in a club calendar (it reaches everyone)', () => {
    expect(versandEventsOf([ev({ calendars: ['scs', 'u14'] })], calendars, today)[0].groupKeys).toBeUndefined();
  });
});

describe('versandEventWhen', () => {
  it('matches the mail: date, comma, time; the date alone without a time', () => {
    expect(versandEventWhen('20261201', '19:30')).toBe('01.12.2026, 19:30');
    expect(versandEventWhen('20261201', '')).toBe('01.12.2026');
    expect(versandEventWhen(undefined, '19:30')).toBe('');
  });
});

describe('group admin channels', () => {
  it('drop the profile\'s post tick for a group admin', () => {
    const { deliveries } = buildVersandRows([beat], [{ personKey: 'b', possible: [DeliveryChannel.Post], initial: [DeliveryChannel.Post] }], GROUP_ADMIN_MAILING_CHANNELS);
    expect(deliveries).toEqual({ b: [] });
  });
});

describe('nonPdfAttachmentNames', () => {
  it('lists what a letter cannot carry', () => {
    expect(nonPdfAttachmentNames([
      { filename: 'a.pdf', contentType: 'application/pdf' },
      { filename: 'b.PDF' },
      { filename: 'c.jpg', contentType: 'image/jpeg' },
    ])).toEqual(['c.jpg']);
  });
});

describe('emailOnlyDeliveries', () => {
  const E = DeliveryChannel.Email, C = DeliveryChannel.Chat, P = DeliveryChannel.Post;

  it('switched on, keeps only the E-Mail ticks', () => {
    expect(emailOnlyDeliveries({ a: [P, E, C], b: [C] }, true)).toEqual({ a: [E], b: [] });
  });

  it('switched off, brings back the earlier Post and In-App ticks beside the current E-Mail ticks', () => {
    const before = { a: [P, E, C], b: [C] };
    // meanwhile a lost E-Mail, b gained it
    expect(emailOnlyDeliveries({ a: [], b: [E] }, false, before)).toEqual({ a: [C, P], b: [C, E] });
  });
});

describe('hasPostDelivery', () => {
  it('is true when anybody is ticked under Post', () => {
    expect(hasPostDelivery({ a: [DeliveryChannel.Email], b: [DeliveryChannel.Post] })).toBe(true);
    expect(hasPostDelivery({ a: [DeliveryChannel.Email] })).toBe(false);
  });
});

describe('untickEmailAddress / sharedEmailCount', () => {
  const rows = [
    { personKey: 'a', name: 'Anna', email: 'fam@x.ch', possible: [DeliveryChannel.Email, DeliveryChannel.Post] },
    { personKey: 'c', name: 'Carl', email: 'FAM@x.ch', possible: [DeliveryChannel.Email] },
    { personKey: 'd', name: 'Dora', email: 'dora@x.ch', possible: [DeliveryChannel.Email] },
  ];
  const deliveries = { a: [DeliveryChannel.Email, DeliveryChannel.Post], c: [DeliveryChannel.Email], d: [DeliveryChannel.Email] };

  it('counts the ticks that share an address with an earlier one', () => {
    expect(sharedEmailCount(rows, deliveries)).toBe(1);
    expect(versandBcc(rows, deliveries)).toEqual(['fam@x.ch', 'dora@x.ch']);
  });

  it('unticks E-Mail for every person with the address, keeping their other ticks', () => {
    expect(untickEmailAddress(rows, deliveries, 'Fam@X.ch')).toEqual({ a: [DeliveryChannel.Post], c: [], d: [DeliveryChannel.Email] });
  });

  it('returns the same object when nobody had it ticked', () => {
    expect(untickEmailAddress(rows, deliveries, 'nobody@x.ch')).toBe(deliveries);
  });
});

describe('applyHouseholds', () => {
  const P = DeliveryChannel.Post;
  const E = DeliveryChannel.Email;
  const C = DeliveryChannel.Chat;
  const kid1 = { personKey: 'k1', name: 'Kim', email: '', possible: [P] };
  const kid2 = { personKey: 'k2', name: 'Kai', email: 'kai@x.ch', possible: [E, P] };
  const mom = { personKey: 'm', name: 'Mia', email: 'mia@x.ch', possible: [C, E, P] };
  const household = (over: Partial<MailingHousehold> = {}): MailingHousehold => ({
    okey: 'h1', name: 'Familie Muster', contactKey: 'm', contactName: 'Mia Muster', memberKeys: ['m', 'k1', 'k2'],
    bundle: { post: true, email: false, inApp: false },
    contact: { personKey: 'm', possible: [C, E, P], initial: [E] },
    ...over,
  });

  it('combines two members on Post into one household row with Post', () => {
    const rows = [kid1, kid2];
    const { rows: out, deliveries } = applyHouseholds(rows, { k1: [P], k2: [P] }, [household()], new Set());
    const hh = out.find((r) => r.personKey === 'household.h1');
    expect(hh?.name).toBe('Familie Muster');
    expect(hh?.contactName).toBe('Mia Muster');
    expect(hh?.members).toEqual([{ personKey: 'k1', name: 'Kim' }, { personKey: 'k2', name: 'Kai' }]);
    expect(deliveries['household.h1']).toEqual([P]);
    expect(deliveries['k1']).toEqual([]);
    expect(deliveries['k2']).toEqual([]);
    expect(out.map((r) => r.personKey)).toEqual(['household.h1', 'k1', 'k2']);
  });

  it('leaves Email untouched per member when only Post is bundled', () => {
    const { rows: out, deliveries } = applyHouseholds([kid2, mom], { k2: [E], m: [E] }, [household()], new Set());
    expect(out.map((r) => r.personKey)).toEqual(['k2', 'm']);
    expect(deliveries).toEqual({ k2: [E], m: [E] });
  });

  it('adds the household row even when the contact is not among the rows', () => {
    const { rows: out, deliveries } = applyHouseholds([kid1], { k1: [P] }, [household()], new Set());
    expect(out.map((r) => r.personKey)).toEqual(['household.h1', 'k1']);
    expect(deliveries['household.h1']).toEqual([P]);
    expect(out[0].email).toBe('');
  });

  it('keeps Post per member when the contact cannot get a letter', () => {
    const h = household({ contact: { personKey: 'm', possible: [E], initial: [E] } });
    const before = { k1: [P], k2: [P] };
    const { rows: out, deliveries } = applyHouseholds([kid1, kid2], before, [h], new Set());
    expect(out.map((r) => r.personKey)).toEqual(['k1', 'k2']);
    expect(deliveries).toEqual(before);
  });

  it('changes nothing for a household the sender split', () => {
    const rows = [kid1, kid2];
    const before = { k1: [P], k2: [P] };
    const result = applyHouseholds(rows, before, [household()], new Set(['h1']));
    expect(result.rows).toEqual(rows);
    expect(result.deliveries).toEqual(before);
  });

  it('combines per bundled channel and takes the contact email for the household row', () => {
    const h = household({ bundle: { post: true, email: true, inApp: false } });
    const { rows: out, deliveries } = applyHouseholds([mom, kid2], { m: [E], k2: [E, P] }, [h], new Set());
    expect(deliveries['household.h1']).toEqual([E, P]);
    expect(deliveries['m']).toEqual([]);
    expect(deliveries['k2']).toEqual([]);
    const hh = out.find((r) => r.personKey === 'household.h1');
    expect(hh?.email).toBe('mia@x.ch');
    expect(hh?.possible).toEqual([E, P]);
  });

  it('does not count a member whose channels all went to the household row as unreachable', () => {
    const { rows: out, deliveries } = applyHouseholds([kid1, kid2], { k1: [P], k2: [P] }, [household()], new Set());
    expect(unreachableCount(out, deliveries)).toBe(0);
    expect(unreachableCount(out, { ...deliveries, 'household.h1': [] })).toBe(2);
  });
});
