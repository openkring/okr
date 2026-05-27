import { Component, inject } from '@angular/core';
import { IonNote } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'bk-read-only-banner',
  standalone: true,
  imports: [IonNote],
  template: `
    @if (store.isExternallyManaged()) {
      <ion-note color="warning">
        {{ store.i18n.read_only_title() }}: {{ store.i18n.read_only_msg() }}
      </ion-note>
    }
  `,
})
export class ReadOnlyBanner {
  protected readonly store = inject(AccountingStore);
}
