import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { REPORTING_I18N_KEYS, ReportingI18n } from '@okr/finance-reporting-util';

@Component({
  selector: 'okr-balance-sheet-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.balance_title() }}</ion-title>
        <ion-button slot="end" fill="clear" (click)="exportCsv()">{{ i18n.export_csv() }}</ion-button>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (balancesResource.isLoading()) {
        <p>{{ i18n.loading() }}</p>
      } @else {
        <ion-list>
          @for (entry of balancesResource.value() ?? []; track entry.accountKey) {
            <ion-item>
              <ion-label>{{ entry.accountKey }}</ion-label>
              <ion-note slot="end">
                {{ i18n.debit() }}: {{ entry.totalDebit }} | {{ i18n.credit() }}: {{ entry.totalCredit }} | {{ i18n.net() }}: {{ entry.net }}
              </ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class BalanceSheetPage {
  protected readonly i18n = inject(I18nService).translateAll(REPORTING_I18N_KEYS) as ReportingI18n;
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly balancesResource = rxResource({
    stream: () => from(this.reportingService.getAccountBalances(this.accountingStore.accountingTenantId())),
  });

  protected async exportCsv(): Promise<void> {
    await this.reportingService.exportBalancesToCsv(this.accountingStore.accountingTenantId());
  }
}
