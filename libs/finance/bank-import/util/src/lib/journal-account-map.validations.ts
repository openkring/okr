import { enforce, only, staticSuite, test } from 'vest';

import { JournalAccountMap } from './journal-import.util';

/** Every bexio account must land on a tenant account before the import may post (spec §12.2). */
export const journalAccountMapValidations = staticSuite(
  (model: JournalAccountMap, tenants: string, tags: string, field?: string) => {
    if (field) only(field);
    test('entries', 'journalAccountMap.unresolved', () => {
      enforce((model.entries ?? []).every(e => (e.accountKey ?? '').length > 0)).isTruthy();
    });
  });
