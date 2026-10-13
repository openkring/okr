import { Injectable, signal } from '@angular/core';

/**
 * The books the accounting navigation currently shows (spec 1.100 §4.2). Written by
 * `AccountingStore` (finance), read by `MenuStore` (cms) to expand '@BOOKS@' — this root signal
 * keeps cms-menu free of a finance dependency. '' = not decided yet: readers fall back to
 * `appConfig().defaultAccountingTenantId`, never to the tenant id.
 */
@Injectable({ providedIn: 'root' })
export class SelectedBooks {
  private readonly value = signal('');
  public readonly current = this.value.asReadonly();

  public set(id: string): void {
    this.value.set(id);
  }
}
