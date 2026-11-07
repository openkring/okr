import { describe, expect, it } from 'vitest';
import { DeliveryChannel } from '@okr/shared-models';
import { buildVersandRows, deliveryTotals, isDeliveryEditable, toggleDelivery, unreachableCount, versandBcc } from './versand.util';

const anna = { personKey: 'a', name: 'Anna', email: 'anna@x.ch' };
const beat = { personKey: 'b', name: 'Beat', email: '' };

describe('buildVersandRows', () => {
  it('ticks only the active channels of the profile choice', () => {
    const { rows, deliveries } = buildVersandRows([anna, beat], [
      { personKey: 'a', possible: [DeliveryChannel.Chat, DeliveryChannel.Email], initial: [DeliveryChannel.Chat, DeliveryChannel.Email] },
      { personKey: 'b', possible: [DeliveryChannel.Post], initial: [DeliveryChannel.Post] },
    ]);
    expect(rows.map((r) => r.possible)).toEqual([['chat', 'email'], ['post']]);
    expect(deliveries).toEqual({ a: ['email'], b: [] });
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
    expect(toggleDelivery(before, row, DeliveryChannel.Chat)).toBe(before);
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
