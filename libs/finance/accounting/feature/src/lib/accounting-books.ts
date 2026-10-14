import { Component, computed, inject } from '@angular/core';

import { AccountingStore } from './accounting.store';
import { injectAccountingRoute } from './accounting-route';

/**
 * Names the books of the current accounting screen («SCS» / «GSS») in the page's title bar, left of
 * the «…» menu (spec 1.100). Read-only — the books are switched in the «Buchhaltung» menu. Shown only
 * when the app keeps several sets of books and the screen belongs to one of them.
 */
@Component({
  selector: 'okr-accounting-books',
  styles: [`
    .books { display: inline-block; margin-inline: 8px; padding: 2px 10px; border-radius: 12px;
      font-size: .85rem; font-weight: 600; letter-spacing: .03em;
      background: rgba(255, 255, 255, .2); color: inherit; }
  `],
  template: `
    @if (show()) {
      <span class="books">{{ books().toUpperCase() }}</span>
    }
  `,
})
export class AccountingBooks {
  private readonly store = inject(AccountingStore);
  private readonly current = injectAccountingRoute();

  protected readonly books = computed(() => this.current()?.books || this.store.selectedBooks());
  protected readonly show = computed(() =>
    this.store.availableBooks().length > 1 && !!this.current()?.segment.booksScoped && !!this.books());
}
