import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-income-statement-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Erfolgsrechnung</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (linesResource.isLoading()) {
        <p>Loading...</p>
      } @else {
        <ion-list>
          @for (entry of linesResource.value() ?? []; track entry.accountKey) {
            <ion-item>
              <ion-label>{{ entry.accountKey }}</ion-label>
              <ion-note slot="end">Net: {{ entry.net }}</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class IncomeStatementPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly linesResource = rxResource({
    stream: () => from(this.reportingService.getAccountBalances(this.accountingStore.accountingTenantId())),
  });
}
