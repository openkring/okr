import { Component, computed, inject, input } from '@angular/core';
import { IonButton } from '@ionic/angular';

import { fill } from '@okr/shared-util-core';

import { JournalStore, NO_BOOK_PRINTS } from './journal.store';

/**
 * «Fotos fürs Buch hochladen» (book export): this author's photos of the book go from the iPad's Photos library to the
 * cloud in print size. Native only, runs at home with Internet; shows progress and the result line.
 */
@Component({
  selector: 'okr-journal-book-prints',
  imports: [IonButton],
  styles: [`
    :host { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0 8px;
      font-size: 0.8rem; color: var(--ion-color-medium); }
    .buttons { display: flex; flex: none; }
  `],
  template: `
    <span>{{ text() }}</span>
    <div class="buttons">
      <ion-button size="small" fill="clear" [disabled]="running()" (click)="store.uploadBookPrints(journalKey())">{{ store.i18n.prints_action() }}</ion-button>
    </div>
  `,
})
export class JournalBookPrints {
  protected readonly store = inject(JournalStore);

  public readonly journalKey = input.required<string>();

  private readonly status = computed(() => {
    const status = this.store.bookPrints();
    return status.journalKey === this.journalKey() ? status : NO_BOOK_PRINTS;
  });
  protected readonly running = computed(() => this.store.bookPrints().state === 'running');

  protected readonly text = computed(() => {
    const i18n = this.store.i18n;
    const status = this.status();
    switch (status.state) {
      case 'running':
        return fill(i18n.prints_progress(), { done: status.done, total: status.total });
      case 'offline':
        return i18n.prints_offline();
      case 'done': {
        if (status.total === 0) return i18n.prints_nothing();
        const result = fill(i18n.prints_result(), { uploaded: status.uploaded, missing: status.missing });
        return status.failed > 0 ? `${result} · ${fill(i18n.prints_failed(), { failed: status.failed })}` : result;
      }
      default:
        return i18n.prints_hint();
    }
  });
}
