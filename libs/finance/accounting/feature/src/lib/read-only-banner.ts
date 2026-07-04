import { Component, computed, inject, input } from '@angular/core';
import { IonNote } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'okr-read-only-banner',
  standalone: true,
  imports: [IonNote],
  template: `
    @if (store.isExternallyManaged()) {
      <ion-note color="warning">{{ bannerText() }}</ion-note>
    }
  `,
})
export class ReadOnlyBanner {
  protected readonly store = inject(AccountingStore);

  /** Optional list-specific warning text; falls back to the generic accounting message. */
  public readonly message = input<string>('');

  protected readonly bannerText = computed(() =>
    this.message() || `${this.store.i18n.read_only_title()}: ${this.store.i18n.read_only_msg()}`
  );
}
