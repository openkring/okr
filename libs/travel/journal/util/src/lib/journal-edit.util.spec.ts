import { describe, expect, it } from 'vitest';
import type { AvatarInfo } from '@okr/shared-models';
import { authorsWithout, journalFormOf, journalPatch, removableAuthorKeys } from './journal-edit.util';
import { JournalWriteRefused } from './journal-identity.util';
import type { JournalView } from './journal-view.util';

const view: JournalView = {
  key: 'j1', title: 'Island', subTitle: 'Sommer', startDate: '', endDate: '', coverImageKey: 'img1', coverLabel: 'Cover', lastPageLabel: '',
};
const author = (key: string): AvatarInfo => ({ key, name1: key, name2: '', modelType: 'person', type: '', subType: '', label: key });

describe('journalPatch', () => {
  it('is empty when nothing changed', () => {
    expect(journalPatch(journalFormOf(view), view)).toEqual({});
  });
  it('trims values and ignores whitespace-only changes', () => {
    expect(journalPatch({ ...journalFormOf(view), title: '  Island  ' }, view)).toEqual({});
    expect(journalPatch({ ...journalFormOf(view), lastPageLabel: '  © 2027  ' }, view)).toEqual({ lastPageLabel: '© 2027' });
  });
  it('returns only the changed keys, including a cleared cover', () => {
    expect(journalPatch({ ...journalFormOf(view), title: 'Norwegen', coverImageKey: '' }, view)).toEqual({ title: 'Norwegen', coverImageKey: '' });
  });
});

describe('removableAuthorKeys', () => {
  it('excludes the owner and the caller', () => {
    expect(removableAuthorKeys([author('o'), author('me'), author('x'), author('y')], 'o', 'me')).toEqual(['x', 'y']);
  });
});

describe('authorsWithout', () => {
  const authors = [author('o'), author('me'), author('x')];
  it('removes the person from both lists, keeping the owner', () => {
    expect(authorsWithout(authors, ['o', 'me', 'x'], 'o', 'x', 'me')).toEqual({ authors: [author('o'), author('me')], authorKeys: ['o', 'me'] });
  });
  it('refuses the owner and the caller', () => {
    expect(() => authorsWithout(authors, ['o', 'me', 'x'], 'o', 'o', 'me')).toThrow(JournalWriteRefused);
    expect(() => authorsWithout(authors, ['o', 'me', 'x'], 'o', 'me', 'me')).toThrow(JournalWriteRefused);
  });
});
