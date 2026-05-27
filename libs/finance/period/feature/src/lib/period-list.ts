import { Component, inject } from '@angular/core';
import { IonBadge, IonButton, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { PeriodStore } from './period.store';

@Component({
  selector: 'bk-period-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon,
    SvgIconPipe,
  ],
  providers: [PeriodStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p>Loading...</p>
      } @else if (store.periods().length === 0) {
        <p>{{ store.i18n.empty() }}</p>
      } @else {
        <ion-list>
          @for (period of store.periods(); track period.bkey) {
            <ion-item>
              <ion-label>
                <h3>{{ period.year }}{{ period.month > 0 ? '-' + period.month : '' }}</h3>
              </ion-label>
              @if (period.isLocked) {
                <ion-badge slot="end" color="warning">{{ store.i18n.locked_label() }}</ion-badge>
                @if (!store.isReadOnly()) {
                  <ion-button slot="end" fill="clear" (click)="store.unlock(period)">
                    <ion-icon src="{{ 'lock-open' | svgIcon }}" />
                  </ion-button>
                }
              } @else {
                @if (!store.isReadOnly()) {
                  <ion-button slot="end" fill="clear" (click)="store.lock(period)">
                    <ion-icon src="{{ 'lock-closed' | svgIcon }}" />
                  </ion-button>
                }
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class PeriodList {
  protected readonly store = inject(PeriodStore);
}
