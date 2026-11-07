import { describe, expect, it } from 'vitest';
import { CalEventModel, DeliveryChannel } from '@okr/shared-models';
import {
  buildVersandRows, deliveryTotals, isDeliveryEditable, toggleDelivery, unreachableCount, versandBcc, versandDeliveries, groupReachWarnings,
  VersandEvent, versandEventsOf, versandEventWhen,
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
    expect(deliveries).toEqual({ a: ['chat', 'email'], b: [] });
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

  it('ignores a channel that is not sendable yet or not possible', () => {
    const before = { a: [] };
    expect(toggleDelivery(before, { ...row, possible: [DeliveryChannel.Post] }, DeliveryChannel.Post)).toBe(before);
    expect(toggleDelivery(before, row, DeliveryChannel.Post)).toBe(before);
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
  const cup: VersandEvent = { caleventKey: 'e1', name: 'Cup', when: '01.12.2026', groupKey: 'g1' };
  const open: VersandEvent = { caleventKey: 'e2', name: 'Fest', when: '02.12.2026' };

  it('groupReachWarnings counts only non-members', () => {
    expect(groupReachWarnings([cup], ['a', 'b', 'c'], { g1: ['a'] })).toEqual([{ caleventKey: 'e1', eventName: 'Cup', count: 2 }]);
  });

  it('groupReachWarnings skips events without groupKey', () => {
    expect(groupReachWarnings([open], ['a', 'b'], {})).toEqual([]);
  });

  it('groupReachWarnings drops a zero count', () => {
    expect(groupReachWarnings([cup], ['a'], { g1: ['a', 'z'] })).toEqual([]);
  });
});

describe('versandEventsOf', () => {
  const today = '20261107';
  const ev = (over: Partial<CalEventModel>): CalEventModel =>
    ({ okey: 'e', name: 'GV', startDate: '20261201', startTime: '19:30', calendars: ['scs'], state: 'planned', ...over }) as CalEventModel;
  const calendars = [{ okey: 'scs', owner: 'org.scs' }, { okey: 'u14', owner: 'group.g14' }];
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

  it('takes the group from a group-owned calendar', () => {
    expect(versandEventsOf([ev({ calendars: ['scs', 'u14'] })], calendars, today)[0].groupKey).toBe('g14');
  });
});

describe('versandEventWhen', () => {
  it('matches the mail: date, comma, time; the date alone without a time', () => {
    expect(versandEventWhen('20261201', '19:30')).toBe('01.12.2026, 19:30');
    expect(versandEventWhen('20261201', '')).toBe('01.12.2026');
    expect(versandEventWhen(undefined, '19:30')).toBe('');
  });
});
