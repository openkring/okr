import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-balance-sheet-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Bilanz</ion-title>
        <ion-button slot="end" fill="clear" (click)="exportCsv()">Export CSV</ion-button>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (balancesResource.isLoading()) {
        <p>Loading...</p>
      } @else {
        <ion-list>
          @for (entry of balancesResource.value() ?? []; track entry.accountKey) {
            <ion-item>
              <ion-label>{{ entry.accountKey }}</ion-label>
              <ion-note slot="end">
                Dr: {{ entry.totalDebit }} | Cr: {{ entry.totalCredit }} | Net: {{ entry.net }}
              </ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class BalanceSheetPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly balancesResource = rxResource({
    stream: () => from(this.reportingService.getAccountBalances(this.accountingStore.accountingTenantId())),
  });

  protected async exportCsv(): Promise<void> {
    await this.reportingService.exportBalancesToCsv(this.accountingStore.accountingTenantId());
  }
}
