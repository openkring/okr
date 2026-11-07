import { describe, expect, it } from 'vitest';
import { mayReadNotice } from './notice-attachment';

describe('mayReadNotice', () => {
  const notice = { tenants: ['scs'], recipients: ['p1'] };

  it('lets a recipient read, in any tenant of theirs', () => {
    expect(mayReadNotice(notice, { personKey: 'p1', tenants: ['kwa'] })).toBe(true);
  });

  it('lets memberAdmin or privileged of the tenant read', () => {
    expect(mayReadNotice(notice, { personKey: 'x', tenants: ['scs'], roles: { memberAdmin: true } })).toBe(true);
    expect(mayReadNotice(notice, { personKey: 'x', tenants: ['kwa'], roles: { privileged: true } })).toBe(false);
  });

  it('refuses everybody else', () => {
    expect(mayReadNotice(notice, { personKey: 'x', tenants: ['scs'], roles: { registered: true } })).toBe(false);
    expect(mayReadNotice(notice, {})).toBe(false);
  });
});
