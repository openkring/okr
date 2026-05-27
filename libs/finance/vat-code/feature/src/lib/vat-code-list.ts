import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { VatCodeStore } from './vat-code.store';

@Component({
  selector: 'bk-vat-code-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonNote, IonFab, IonFabButton, IonIcon, IonButton,
    SvgIconPipe,
  ],
  providers: [VatCodeStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
        @if (!store.isReadOnly() && store.vatCodes().length === 0) {
          <ion-button slot="end" fill="clear" (click)="store.seedStandard()">
            {{ store.i18n.seed_label() }}
          </ion-button>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p>Loading...</p>
      } @else if (store.vatCodes().length === 0) {
        <p>{{ store.i18n.empty() }}</p>
      } @else {
        <ion-list>
          @for (code of store.vatCodes(); track code.bkey) {
            <ion-item (click)="store.openEdit(code, store.isReadOnly())">
              <ion-label>
                <h3>{{ code.code }} — {{ code.name }}</h3>
                <p>{{ code.rate }}% | {{ code.direction }}</p>
              </ion-label>
              <ion-note slot="end">{{ code.validFrom }}–{{ code.validTo || '∞' }}</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    @if (!store.isReadOnly()) {
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="store.openCreate()">
          <ion-icon src="{{ 'add' | svgIcon }}" />
        </ion-fab-button>
      </ion-fab>
    }
  `,
})
export class VatCodeList {
  protected readonly store = inject(VatCodeStore);
}
