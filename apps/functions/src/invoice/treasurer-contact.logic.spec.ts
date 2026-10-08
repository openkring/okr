import { describe, expect, it } from 'vitest';

import { activeResponsible, treasurerContactFields } from './treasurer-contact.logic';

const bruno = { key: 'kaiser', name1: 'Bruno', name2: 'Kaiser', modelType: 'person', label: 'Bruno Kaiser' };
const anna = { key: 'anna', name1: 'Anna', name2: 'Muster', modelType: 'person', label: 'Anna Muster' };

describe('activeResponsible', () => {
  it('is the responsible person without a delegate', () => expect(activeResponsible({ responsibleAvatar: bruno }, '20261008')).toBe(bruno));
  it('is the delegate inside the delegate period', () =>
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: anna, delegateValidFrom: '20261001', delegateValidTo: '20261031' }, '20261008')).toBe(anna));
  it('is the responsible person outside the delegate period', () => {
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: anna, delegateValidFrom: '20261101', delegateValidTo: '20261130' }, '20261008')).toBe(bruno);
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: anna, delegateValidFrom: '20260901', delegateValidTo: '20260930' }, '20261008')).toBe(bruno);
  });
  it('an open-ended delegate period counts as valid', () => {
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: anna, delegateValidFrom: '', delegateValidTo: '' }, '20261008')).toBe(anna);
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: anna, delegateValidFrom: '20261001' }, '20261008')).toBe(anna);
  });
  it('ignores a delegate without key', () =>
    expect(activeResponsible({ responsibleAvatar: bruno, delegateAvatar: { key: '' } }, '20261008')).toBe(bruno));
  it('is undefined without a responsible person', () => expect(activeResponsible(undefined, '20261008')).toBeUndefined());
});

describe('treasurerContactFields', () => {
  const addr = (o: Record<string, unknown>) => ({ isArchived: false, isFavorite: false, ...o });
  it('takes the favourite email and phone', () => {
    const c = treasurerContactFields(bruno, [
      addr({ addressChannel: 'email', email: 'old@x.ch' }),
      addr({ addressChannel: 'email', email: 'bruno@seeclub.org', isFavorite: true }),
      addr({ addressChannel: 'phone', phone: '079 790 8929', isFavorite: true }),
      addr({ addressChannel: 'postal', city: 'Stäfa' }),
    ] as never);
    expect(c).toEqual({ name: 'Bruno Kaiser', email: 'bruno@seeclub.org', phone: '079 790 8929' });
  });
  it('leaves missing channels empty and skips archived ones', () =>
    expect(treasurerContactFields(anna, [addr({ addressChannel: 'email', email: 'gone@x.ch', isArchived: true })] as never))
      .toEqual({ name: 'Anna Muster', email: '', phone: '' }));
  it('builds the name from name1/name2 when there is no label', () =>
    expect(treasurerContactFields({ key: 'k', name1: 'Eva', name2: 'Muster' }, []).name).toBe('Eva Muster'));
  it('is empty without a person', () => expect(treasurerContactFields(undefined, [])).toEqual({ name: '', email: '', phone: '' }));
});
