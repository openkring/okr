import type { AvatarInfo } from '@okr/shared-models';
import { JournalWriteRefused } from './journal-identity.util';
import type { JournalView } from './journal-view.util';

/** The «Reisetagebuch ändern» form (spec 1.154): the journal's own fields. '' for the cover = automatic. */
export interface JournalFormModel {
  title: string;
  subTitle: string;
  coverImageKey: string;
  coverLabel: string;
  lastPageLabel: string;
}

const FIELDS: (keyof JournalFormModel)[] = ['title', 'subTitle', 'coverImageKey', 'coverLabel', 'lastPageLabel'];

export function journalFormOf(view: JournalView): JournalFormModel {
  return {
    title: view.title, subTitle: view.subTitle, coverImageKey: view.coverImageKey, coverLabel: view.coverLabel, lastPageLabel: view.lastPageLabel,
  };
}

/** Only the fields whose trimmed value differs from the journal's current one, trimmed. `{}` when nothing changed. */
export function journalPatch(model: JournalFormModel, current: JournalView): Partial<JournalFormModel> {
  const patch: Partial<JournalFormModel> = {};
  for (const field of FIELDS) {
    const value = (model[field] ?? '').trim();
    if (value !== current[field]) patch[field] = value;
  }
  return patch;
}

/** The authors the caller may remove: everybody but the creator and the caller. */
export function removableAuthorKeys(authors: AvatarInfo[], ownerKey: string, me: string): string[] {
  return authors.map((a) => a.key).filter((key) => key !== ownerKey && key !== me);
}

/** The author list and `authorKeys` without `personKey`; the creator and the caller cannot be removed. */
export function authorsWithout(
  authors: AvatarInfo[], authorKeys: string[], ownerKey: string, personKey: string, me: string,
): { authors: AvatarInfo[]; authorKeys: string[] } {
  if (personKey === ownerKey || personKey === me) throw new JournalWriteRefused('owner');
  return { authors: authors.filter((a) => a.key !== personKey), authorKeys: authorKeys.filter((key) => key !== personKey) };
}
