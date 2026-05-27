import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingModel } from '@bk2/shared-models';
import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-cash-flow-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>Geldflussrechnung</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      @if (journalResource.isLoading()) { <p>Loading...</p> }
      @else {
        <ion-list>
          @for (b of journalResource.value() ?? []; track b.bkey) {
            <ion-item>
              <ion-label>{{ b.date }} — {{ b.title }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class CashFlowPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly journalResource = rxResource<BookingModel[], unknown>({
    stream: () => this.reportingService.getJournalEntries(this.accountingStore.accountingTenantId()),
  });
}
