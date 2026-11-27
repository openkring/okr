import { describe, expect, it } from 'vitest';
import type { AvatarInfo, PeopleConfig } from '@okr/shared-models';
import { PEOPLE_SECTION_SHAPE } from '@okr/shared-models';

import {
  addPeoplePerson, addPeopleResponsibility, clearPeopleResponsibilityParent, hidePeoplePerson, movePeoplePerson,
  removePeoplePerson, removePeopleResponsibility, setPeopleGroup, setPeopleLook, setPeoplePersonLabel,
  setPeopleResponsibilityParent, setPeopleSource, showAllPeople, showPeoplePerson,
} from './people-edit.util';

const person = (key: string): AvatarInfo => ({ key, name1: key, name2: '', modelType: 0, type: '', subType: '', label: '' }) as unknown as AvatarInfo;
const base = (patch: Partial<PeopleConfig> = {}): PeopleConfig => ({ ...(PEOPLE_SECTION_SHAPE.properties as PeopleConfig), persons: [], ...patch });

describe('people edit operations', () => {
  it('setPeopleSource clears hiddenKeys and orderKeys for another type, keeps the rest', () => {
    const c = base({ type: 'group', groupId: 'g', hiddenKeys: ['a'], orderKeys: ['b'] });
    const out = setPeopleSource(c, 'persons');
    expect(out.type).toBe('persons');
    expect(out.hiddenKeys).toBeUndefined();
    expect(out.orderKeys).toBeUndefined();
    expect(out.groupId).toBe('g');
    expect(c.hiddenKeys).toEqual(['a']);
  });

  it('setPeopleSource to the same type is a no-op', () => {
    const c = base({ type: 'group', hiddenKeys: ['a'] });
    expect(setPeopleSource(c, 'group')).toEqual(c);
  });

  it('addPeoplePerson appends and ignores duplicate keys', () => {
    const c = addPeoplePerson(base(), person('a'));
    expect(c.persons.map((p) => p.key)).toEqual(['a']);
    expect(addPeoplePerson(c, person('a')).persons).toHaveLength(1);
  });

  it('removePeoplePerson works for persons only', () => {
    const c = base({ type: 'persons', persons: [person('a'), person('b')] });
    expect(removePeoplePerson(c, 'a').persons.map((p) => p.key)).toEqual(['b']);
    const g = base({ type: 'group', persons: [person('a')] });
    expect(removePeoplePerson(g, 'a')).toEqual(g);
  });

  it('setPeopleGroup to another group clears overrides, to the same keeps them', () => {
    const c = base({ type: 'group', groupId: 'g1', hiddenKeys: ['a'], orderKeys: ['b', 'a'], excludedPersons: [person('x')] });
    const other = setPeopleGroup(c, 'g2');
    expect(other.groupId).toBe('g2');
    expect(other.hiddenKeys).toBeUndefined();
    expect(other.orderKeys).toBeUndefined();
    expect(other.excludedPersons).toBeUndefined();
    expect(setPeopleGroup(c, 'g1').hiddenKeys).toEqual(['a']);
  });

  it('addPeopleResponsibility folds the legacy id and avoids duplicates', () => {
    const c = base({ type: 'responsibility', responsibilityId: 'r0', responsibilityIds: ['r1'] });
    const out = addPeopleResponsibility(c, 'r2');
    expect(out.responsibilityIds).toEqual(['r0', 'r1', 'r2']);
    expect(out.responsibilityId).toBeUndefined();
    expect(addPeopleResponsibility(out, 'r2').responsibilityIds).toEqual(['r0', 'r1', 'r2']);
  });

  it('removePeopleResponsibility removes an id and the legacy one', () => {
    const c = base({ type: 'responsibility', responsibilityId: 'r0', responsibilityIds: ['r1'] });
    expect(removePeopleResponsibility(c, 'r0').responsibilityIds).toEqual(['r1']);
    expect(removePeopleResponsibility(c, 'r0').responsibilityId).toBeUndefined();
    expect(removePeopleResponsibility(c, 'r1').responsibilityIds).toEqual(['r0']);
  });

  it('sets and clears the responsibility parent', () => {
    const set = setPeopleResponsibilityParent(base(), 'group.k', 'Team');
    expect(set.responsibilityParentKey).toBe('group.k');
    expect(set.responsibilityParentName).toBe('Team');
    const cleared = clearPeopleResponsibilityParent(set);
    expect(cleared.responsibilityParentKey).toBeUndefined();
    expect(cleared.responsibilityParentName).toBeUndefined();
  });

  it('setPeoplePersonLabel changes the label for persons only', () => {
    const c = base({ type: 'persons', persons: [person('a'), person('b')] });
    expect(setPeoplePersonLabel(c, 'a', 'Chef').persons.map((p) => p.label)).toEqual(['Chef', '']);
    const g = base({ type: 'group', persons: [person('a')] });
    expect(setPeoplePersonLabel(g, 'a', 'Chef')).toEqual(g);
  });

  it('hides a person, also of type persons, and hiding twice changes nothing', () => {
    const c = base({ type: 'persons', persons: [person('a')] });
    const h = hidePeoplePerson(c, 'a');
    expect(h.hiddenKeys).toEqual(['a']);
    expect(hidePeoplePerson(h, 'a')).toEqual(h);
  });

  it('showing removes the key and removes an empty list', () => {
    const c = base({ type: 'group', hiddenKeys: ['a'] });
    expect(showPeoplePerson(c, 'a').hiddenKeys).toBeUndefined();
    expect(showPeoplePerson(c, 'z')).toEqual(c);
    const stale = base({ type: 'group', excludedPersons: [person('x')] });
    expect(showPeoplePerson(stale, 'x').excludedPersons).toBeUndefined();
  });

  it('showAllPeople clears hiddenKeys and excludedPersons', () => {
    const c = base({ type: 'group', hiddenKeys: ['a'], excludedPersons: [person('x')] });
    const out = showAllPeople(c);
    expect(out.hiddenKeys).toBeUndefined();
    expect(out.excludedPersons).toBeUndefined();
  });

  describe('movePeoplePerson', () => {
    const persons = base({ type: 'persons', persons: [person('a'), person('b'), person('c')] });
    it('reorders the array for persons', () => {
      expect(movePeoplePerson(persons, ['a', 'b', 'c'], 'c', -1).persons.map((p) => p.key)).toEqual(['a', 'c', 'b']);
      expect(movePeoplePerson(persons, ['a', 'b', 'c'], 'a', 1).persons.map((p) => p.key)).toEqual(['b', 'a', 'c']);
    });
    it('does not move the first up or the last down', () => {
      expect(movePeoplePerson(persons, ['a', 'b', 'c'], 'a', -1)).toEqual(persons);
      expect(movePeoplePerson(persons, ['a', 'b', 'c'], 'c', 1)).toEqual(persons);
    });
    it('writes orderKeys for a group section', () => {
      const g = base({ type: 'group' });
      expect(movePeoplePerson(g, ['c', 'a', 'b'], 'a', -1).orderKeys).toEqual(['a', 'c', 'b']);
    });
    it('drops orderKeys when the new order is the natural one', () => {
      const g = base({ type: 'group', orderKeys: ['b', 'a', 'c'] });
      expect(movePeoplePerson(g, ['b', 'a', 'c'], 'a', -1, ['a', 'b', 'c'])).not.toHaveProperty('orderKeys');
      expect(movePeoplePerson(g, ['b', 'a', 'c'], 'c', -1, ['a', 'b', 'c']).orderKeys).toEqual(['b', 'c', 'a']);
    });
    it('ignores an unknown key', () => {
      expect(movePeoplePerson(persons, ['a', 'b', 'c'], 'z', 1)).toEqual(persons);
    });
  });

  it('setPeopleLook writes the changed look fields and keeps the other avatar fields', () => {
    const c = base();
    const out = setPeopleLook(c, { size: 'L', grayscale: true });
    expect(out.avatar.size).toBe('L');
    expect(out.avatar.grayscale).toBe(true);
    expect(out.avatar.shape).toBe(c.avatar.shape);
    expect(out.avatar.altText).toBe(c.avatar.altText);
    expect(c.avatar.size).toBeUndefined();
  });
});
