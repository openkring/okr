import { describe, expect, it } from 'vitest';

import { distinctPersonKeys, personAvatarInfo } from './member-admins.util';

describe('distinctPersonKeys', () => {
  it('skips users without personKey and de-duplicates', () => {
    expect(distinctPersonKeys([{ personKey: 'a' }, {}, { personKey: '' }, { personKey: 'a' }, { personKey: 'b' }])).toEqual(['a', 'b']);
  });
});

describe('personAvatarInfo', () => {
  it('maps first and last name', () => {
    expect(personAvatarInfo('p1', { firstName: 'Anna', lastName: 'Muster' })).toEqual({
      key: 'p1', name1: 'Anna', name2: 'Muster', modelType: 'person', type: '', subType: '', label: 'Anna Muster',
    });
  });

  it('is undefined for a missing person doc', () => {
    expect(personAvatarInfo('p1', undefined)).toBeUndefined();
  });
});
