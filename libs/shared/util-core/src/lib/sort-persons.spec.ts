import { describe, expect, it } from 'vitest';
import { NameDisplay, PersonSortCriteria } from '@okr/shared-models';
import { SortablePerson, sortPersons } from './sort.util';

// Lives in its own spec file because sort.util.spec.ts vi.mock()s ./type.util, which
// sortPersons' getFullName dependency imports transitively.
describe('sortPersons', () => {
  const anna: SortablePerson = { firstName: 'Anna', lastName: 'Zwygart', okey: 'p3' };
  const beat: SortablePerson = { firstName: 'Beat', lastName: 'Äbi', okey: 'p1' };
  const carla: SortablePerson = { firstName: 'carla', lastName: 'Meier', okey: 'p2' };
  const persons = [anna, beat, carla];

  const names = (result: SortablePerson[]) => result.map((p) => p.okey);

  it('sorts by last name by default', () => {
    expect(names(sortPersons(persons))).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by first name', () => {
    expect(names(sortPersons(persons, PersonSortCriteria.Firstname))).toEqual(['p3', 'p1', 'p2']);
  });

  it('sorts by key', () => {
    expect(names(sortPersons(persons, PersonSortCriteria.Key))).toEqual(['p1', 'p2', 'p3']);
  });

  it('sorts by the displayed full name, honouring nameDisplay', () => {
    expect(names(sortPersons(persons, PersonSortCriteria.Fullname, NameDisplay.FirstLast))).toEqual(['p3', 'p1', 'p2']);
    expect(names(sortPersons(persons, PersonSortCriteria.Fullname, NameDisplay.LastFirst))).toEqual(['p1', 'p2', 'p3']);
  });

  it('collates umlauts by base letter instead of after Z', () => {
    // compareWords() would uppercase and sort Äbi last; localeCompare('de') puts it first.
    expect(sortPersons(persons)[0].lastName).toBe('Äbi');
  });

  it('ignores case when comparing', () => {
    const result = sortPersons([{ lastName: 'meier' }, { lastName: 'Maier' }]);
    expect(result.map((p) => p.lastName)).toEqual(['Maier', 'meier']);
  });

  it('falls back to last name for the retired DateOfBirth criterion', () => {
    expect(names(sortPersons(persons, PersonSortCriteria.DateOfBirth))).toEqual(['p1', 'p2', 'p3']);
  });

  it('tolerates missing name fields', () => {
    const result = sortPersons([{ okey: 'x' }, { lastName: 'Aebi', okey: 'y' }]);
    expect(names(result)).toEqual(['x', 'y']);
  });

  it('does not mutate the input array', () => {
    const input = [anna, beat];
    sortPersons(input);
    expect(input).toEqual([anna, beat]);
  });
});
