import type { VatMethod, VatPeriod } from '@okr/shared-models';

/**
 * What an admin answers when the Buchhaltung is switched on (verb `setupBooks`, 2026-11-19).
 *
 * Enabling `finance` alone only creates the menu — every row under «Buchhaltung» needs `@BOOKS@`, which
 * stays empty until an `accounting-configs/{booksId}` document exists and `app-config.defaultAccountingTenantId`
 * names it. These are the fields that cannot be defaulted sensibly; everything else on the config keeps
 * the model's defaults and is changed later in the accounting settings.
 */
export interface BooksSetupInput {
  /** The books id = the okey of the org that keeps them (`orgs/{booksId}`); usually the tenant id. */
  booksId: string;
  /** The org's name — used only when `orgs/{booksId}` does not exist yet and is created. */
  name: string;
  backend: BooksSetupBackend;
  /** Month 1–12 the fiscal year starts in. */
  fiscalYearStart: number;
  vatMethod: VatMethod;
  vatPeriod: VatPeriod;
}

export type BooksSetupBackend = 'native' | 'bexio';
export const BOOKS_SETUP_BACKENDS: readonly BooksSetupBackend[] = ['native', 'bexio'];
export const BOOKS_SETUP_VAT_METHODS: readonly VatMethod[] = ['exempt', 'effective', 'net_tax_rate', 'flat_rate'];
export const BOOKS_SETUP_VAT_PERIODS: readonly VatPeriod[] = ['quarterly', 'semi-annual', 'monthly'];

/** Lowercase letter first, then letters, digits, `-` or `_`; 2–32 characters (same shape as a tenant id). */
export const BOOKS_ID_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
export const BOOKS_NAME_MAX_LENGTH = 100;

export type BooksSetupProblem = 'booksId' | 'name' | 'backend' | 'fiscalYearStart' | 'vatMethod' | 'vatPeriod';

/** The fields of `input` that are invalid; `[]` = valid. Shared by the Vest suite and the callable. */
export function booksSetupProblems(input: Partial<BooksSetupInput> | undefined | null): BooksSetupProblem[] {
  const i = input ?? {};
  const problems: BooksSetupProblem[] = [];
  if (typeof i.booksId !== 'string' || !BOOKS_ID_PATTERN.test(i.booksId)) problems.push('booksId');
  if (typeof i.name !== 'string' || i.name.trim() === '' || i.name.length > BOOKS_NAME_MAX_LENGTH) problems.push('name');
  if (!BOOKS_SETUP_BACKENDS.includes(i.backend as BooksSetupBackend)) problems.push('backend');
  if (!Number.isInteger(i.fiscalYearStart) || (i.fiscalYearStart as number) < 1 || (i.fiscalYearStart as number) > 12) problems.push('fiscalYearStart');
  if (!BOOKS_SETUP_VAT_METHODS.includes(i.vatMethod as VatMethod)) problems.push('vatMethod');
  if (!BOOKS_SETUP_VAT_PERIODS.includes(i.vatPeriod as VatPeriod)) problems.push('vatPeriod');
  return problems;
}

/** Whether the picker should ask for the books: finance is on and no default books are set. */
export function needsBooksSetup(financeEnabled: boolean, defaultAccountingTenantId: string | undefined): boolean {
  return financeEnabled && !(defaultAccountingTenantId ?? '').trim();
}
