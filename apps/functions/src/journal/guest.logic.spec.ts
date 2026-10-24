import { describe, expect, it } from 'vitest';

import { applyManage, deliveryFor, GuestRequestError, memberName, parseGuestRequest } from './guest.logic';

const CODE = '0123456789abcdef0123456789abcdef';
const avatar = (key: string, name1: string, name2: string) => ({ key, name1, name2, modelType: 'person' as const, type: '', subType: '', label: '' });

describe('journal guest logic', () => {
  it('a request is checked before anything is read', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'view' })).toEqual({ journalKey: 'j1', code: CODE, action: 'view' });
    expect(() => parseGuestRequest({ journalKey: 'j1', code: 'short', action: 'view' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j/1', code: CODE, action: 'view' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'delete' })).toThrow(GuestRequestError);
  });

  it('a comment is trimmed, capped and needs a footprint', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: '  Schön!  ', authorName: 'Fake' }))
      .toEqual({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: 'Schön!' }); // extra fields are dropped
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: ' ' })).toThrow();
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'comment', footprintKey: 'f1', text: 'x'.repeat(2001) })).toThrow();
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'like' })).toThrow();
  });

  it('deleting needs a comment key', () => {
    expect(parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: 'c1' }))
      .toEqual({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: 'c1' });
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment' })).toThrow(GuestRequestError);
    expect(() => parseGuestRequest({ journalKey: 'j1', code: CODE, action: 'deleteComment', commentKey: '../x' })).toThrow(GuestRequestError);
  });

  it('names come from the journal lists only', () => {
    const authors = [avatar('bruno', 'Bruno', 'Kaiser')];
    const guests = [{ person: avatar('anna', 'Anna', 'Muster') }];
    expect(memberName('bruno', authors, guests)).toBe('Bruno Kaiser');
    expect(memberName('anna', authors, guests)).toBe('Anna Muster');
    expect(memberName('mallory', authors, guests)).toBe('');
  });

  it('create reuses a live link, revoke and expiry change only that one', () => {
    let n = 0;
    const code = () => `${String(++n).padStart(32, '0')}`;
    const step1 = applyManage([], 'create', 'anna', '2027-01-01T00:00:00Z', code);
    expect(step1.link?.linkCode).toBe('0'.repeat(31) + '1');
    expect(applyManage(step1.links, 'create', 'anna', '2027-01-01T00:00:00Z', code).links).toHaveLength(1);
    const expiring = applyManage(step1.links, 'expiry', 'anna', '2027-01-01T00:00:00Z', code, '2027-03-01T00:00:00Z');
    expect(expiring.link?.expiresAt).toBe('2027-03-01T00:00:00Z');
    expect(applyManage(expiring.links, 'expiry', 'anna', '2027-01-01T00:00:00Z', code, null).link?.expiresAt).toBeUndefined();
    const revoked = applyManage(expiring.links, 'revoke', 'anna', '2027-01-02T00:00:00Z', code);
    expect(revoked.link?.revokedAt).toBe('2027-01-02T00:00:00Z');
    // after a revoke, create issues a new code
    expect(applyManage(revoked.links, 'create', 'anna', '2027-01-03T00:00:00Z', code).links).toHaveLength(2);
  });

  it('the delivery choice', () => {
    expect(deliveryFor('signal')).toEqual(['signal']);
    expect(deliveryFor('none')).toEqual([]);
  });
});
