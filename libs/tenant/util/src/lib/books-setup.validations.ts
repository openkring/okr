import { enforce, staticSuite, test } from 'vest';

import { booksSetupProblems, type BooksSetupInput } from './books-setup.util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const MSG = '@tenant/util.books.validation.';

/**
 * The books setup dialog. The rules are `booksSetupProblems` — the same check the callable runs — so the
 * dialog can never accept what the server refuses. The three selects cannot hold an invalid value; they
 * are checked anyway, filed under their own field.
 */
export const booksSetupValidations = staticSuite((model: BooksSetupInput) => {
  const problems = booksSetupProblems(model);
  for (const field of ['booksId', 'name', 'fiscalYearStart', 'backend', 'vatMethod', 'vatPeriod'] as const) {
    test(field, `${MSG}${field}`, () => {
      enforce(problems.includes(field)).isFalsy();
    });
  }
});

/** A fresh answer set: the tenant's own id and name, calendar year, no VAT — the common case of a small club. */
export function newBooksSetupInput(tenantId: string, name: string): BooksSetupInput {
  return { booksId: tenantId, name, backend: 'native', fiscalYearStart: 1, vatMethod: 'exempt', vatPeriod: 'quarterly' };
}
