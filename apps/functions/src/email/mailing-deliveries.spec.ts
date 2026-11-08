import { describe, expect, it } from 'vitest';
import {
  deliveriesByAddress, deliveryOf, joinDeliveries, mailingCategory, redactReason, type EmailEventRow, type MailDelivery,
} from './mailing-deliveries.logic';
import { mayReadMailingDeliveries } from './mailing-deliveries';

const ev = (event: string, timestamp: number, extra: Partial<EmailEventRow> = {}): EmailEventRow => ({ event, email: 'anna@x.ch', timestamp, ...extra });

describe('mailingCategory', () => {
  it('prefixes the key', () => {
    expect(mailingCategory('abc')).toBe('mailing.abc');
  });
});

describe('redactReason', () => {
  it('removes addresses and squeezes whitespace', () => {
    expect(redactReason('550 5.1.1 <anna@x.ch>:  user   unknown')).toBe('550 5.1.1 <…>: user unknown');
    expect(redactReason('mailbox full for bob.b@mail.example.org')).toBe('mailbox full for …');
  });
  it('cuts a long reason', () => {
    expect(redactReason('x'.repeat(500))).toHaveLength(200);
  });
});

describe('deliveryOf', () => {
  it('is undefined without a telling event', () => {
    expect(deliveryOf([])).toBeUndefined();
    expect(deliveryOf([ev('something', 1)])).toBeUndefined();
  });
  it('lets the latest delivery event decide', () => {
    expect(deliveryOf([ev('soft bounce', 10), ev('delivery', 20)])?.status).toBe('delivered');
    expect(deliveryOf([ev('delivery', 20), ev('soft bounce', 10)])?.status).toBe('delivered');
    expect(deliveryOf([ev('delivery', 10), ev('bounce', 20, { reason: 'gone' })])).toEqual({ status: 'rejected', reason: 'gone', at: new Date(20000).toISOString() });
  });
  it('reads a reject and a suspension as rejected, a soft bounce as deferred, with the redacted reason', () => {
    expect(deliveryOf([ev('reject', 5, { bounce_category: 'blocked' })])?.reason).toBe('blocked');
    expect(deliveryOf([ev('suspension', 5)])?.status).toBe('rejected');
    expect(deliveryOf([ev('soft bounce', 5, { response: '452 <anna@x.ch> full' })])).toMatchObject({ status: 'deferred', reason: '452 <…> full' });
  });
  it('takes an open or click without a delivery event as delivered, without a reason', () => {
    expect(deliveryOf([ev('open', 30, { reason: 'x' })])).toEqual({ status: 'delivered', at: new Date(30000).toISOString() });
    expect(deliveryOf([ev('click', 30)])?.status).toBe('delivered');
  });
  it('turns a delivered mail with a spam report into spam, but not a rejected one', () => {
    expect(deliveryOf([ev('delivery', 10), ev('spam', 20)])?.status).toBe('spam');
    expect(deliveryOf([ev('spam', 20)])?.status).toBe('spam');
    expect(deliveryOf([ev('bounce', 10), ev('spam', 20)])?.status).toBe('rejected');
  });
  it('accepts a string timestamp and leaves out an unknown time', () => {
    expect(deliveryOf([ev('delivery', '40' as never)])?.at).toBe(new Date(40000).toISOString());
    expect(deliveryOf([{ event: 'delivery', email: 'a@x.ch' }])).toEqual({ status: 'delivered' });
  });
});

describe('deliveriesByAddress', () => {
  it('groups by lower-cased address and skips rows without one', () => {
    const map = deliveriesByAddress([
      ev('delivery', 1, { email: 'Anna@X.ch ' }), ev('bounce', 2, { email: 'bob@x.ch' }), ev('delivery', 3, { email: undefined }),
    ]);
    expect([...map.keys()].sort()).toEqual(['anna@x.ch', 'bob@x.ch']);
    expect(map.get('bob@x.ch')?.status).toBe('rejected');
  });
});

describe('joinDeliveries', () => {
  const delivered: MailDelivery = { status: 'delivered' };
  const rejected: MailDelivery = { status: 'rejected', reason: 'gone' };
  const byAddress = new Map<string, MailDelivery>([
    ['anna@x.ch', delivered], ['family@x.ch', rejected], ['board@club.ch', delivered], ['old@x.ch', delivered],
  ]);
  const emailByKey = new Map([['a', 'Anna@x.ch'], ['b', 'family@x.ch'], ['c', 'family@x.ch'], ['d', 'nobody-yet@x.ch']]);

  it('gives each recipient their address\'s status; two on one address both get it; no events = left out', () => {
    const { recipients } = joinDeliveries(byAddress, emailByKey, []);
    expect(recipients).toEqual([{ personKey: 'a', status: 'delivered' }, { personKey: 'b', ...rejected }, { personKey: 'c', ...rejected }]);
  });
  it('returns only the visible To/Cc addresses and counts the rest', () => {
    const result = joinDeliveries(byAddress, emailByKey, ['Board@club.ch', '', 'anna@x.ch']);
    expect(result.addresses).toEqual([{ email: 'board@club.ch', status: 'delivered' }]);
    expect(result.unmatched).toBe(1);                       // old@x.ch: never named back
    expect(JSON.stringify(result)).not.toContain('old@x.ch');
  });
});

describe('mayReadMailingDeliveries', () => {
  it('admits memberAdmin / privileged / admin of the Versand\'s one tenant only', () => {
    const mailing = { tenants: ['scs'] };
    expect(mayReadMailingDeliveries(mailing, { tenants: ['scs'], roles: { memberAdmin: true } })).toBe(true);
    expect(mayReadMailingDeliveries(mailing, { tenants: ['scs'], roles: { privileged: true } })).toBe(true);
    expect(mayReadMailingDeliveries(mailing, { tenants: ['scs'], roles: { registered: true } })).toBe(false);
    expect(mayReadMailingDeliveries(mailing, { tenants: ['p13'], roles: { admin: true } })).toBe(false);
    expect(mayReadMailingDeliveries({ tenants: ['scs', 'p13'] }, { tenants: ['scs'], roles: { admin: true } })).toBe(false);
    expect(mayReadMailingDeliveries({}, { tenants: ['scs'], roles: { admin: true } })).toBe(false);
  });
});
