import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { REPORTING_I18N_KEYS, ReportingI18n } from '@okr/finance-reporting-util';

@Component({
  selector: 'okr-cash-flow-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>{{ i18n.cashflow_title() }}</ion-title></ion-toolbar>
    </ion-header>
    <ion-content>
      @if (journalResource.isLoading()) { <p>{{ i18n.loading() }}</p> }
      @else {
        <ion-list>
          @for (b of journalResource.value() ?? []; track b.okey) {
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
  protected readonly i18n = inject(I18nService).translateAll(REPORTING_I18N_KEYS) as ReportingI18n;
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly journalResource = rxResource<BookingModel[], unknown>({
    stream: () => this.reportingService.getJournalEntries(this.accountingStore.accountingTenantId()),
  });
}
