import { describe, expect, it } from 'vitest';
import { DeliveryChannel } from '@okr/shared-models';
import { buildVersandRows, deliveryTotals, GROUP_ADMIN_MAILING_CHANNELS, isDeliveryEditable, nonPdfAttachmentNames, toggleDelivery, unreachableCount, versandBcc, versandDeliveries } from './versand.util';

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
