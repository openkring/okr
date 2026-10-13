import { inject, Injectable, signal } from '@angular/core';

import { ENV } from '@okr/shared-config';

/** localStorage key prefix of the explicit books choice, per app tenant: `okr.accounting.books.<tenantId>`. */
export const SELECTED_BOOKS_STORAGE_PREFIX = 'okr.accounting.books.';

/** The books the user last chose in the switcher for this app tenant ('' = none or storage unavailable). */
export function readStoredBooks(tenantId: string): string {
  if (!tenantId) return '';
  try { return localStorage.getItem(SELECTED_BOOKS_STORAGE_PREFIX + tenantId) ?? ''; } catch { return ''; }
}

/** Remember an EXPLICIT books choice (the switcher) — never a route visit. */
export function writeStoredBooks(tenantId: string, books: string): void {
  if (!tenantId || !books) return;
  try { localStorage.setItem(SELECTED_BOOKS_STORAGE_PREFIX + tenantId, books); } catch { /* private mode: the choice is a convenience */ }
}

/**
 * The books the accounting navigation currently shows (spec 1.100 §4.2). Written by
 * `AccountingStore` (finance), read by `MenuStore` (cms) to expand '@BOOKS@' — this root signal
 * keeps cms-menu free of a finance dependency. Seeded with the stored explicit choice, so the menu
 * follows it right after a reload, before `AccountingStore` exists (it validates the choice against
 * the available books later). '' = not decided: readers fall back to
 * `appConfig().defaultAccountingTenantId`, never to the tenant id.
 */
@Injectable({ providedIn: 'root' })
export class SelectedBooks {
  private readonly value = signal(readStoredBooks(inject(ENV).tenantId ?? ''));
  public readonly current = this.value.asReadonly();

  public set(id: string): void {
    this.value.set(id);
  }
}
