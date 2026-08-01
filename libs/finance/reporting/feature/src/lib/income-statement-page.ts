import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { REPORTING_I18N_KEYS, ReportingI18n } from '@okr/finance-reporting-util';

@Component({
  selector: 'okr-income-statement-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.income_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (linesResource.isLoading()) {
        <p>{{ i18n.loading() }}</p>
      } @else {
        <ion-list>
          @for (entry of linesResource.value() ?? []; track entry.accountKey) {
            <ion-item>
              <ion-label>{{ entry.accountKey }}</ion-label>
              <ion-note slot="end">{{ i18n.net() }}: {{ entry.net }}</ion-note>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class IncomeStatementPage {
  protected readonly i18n = inject(I18nService).translateAll(REPORTING_I18N_KEYS) as ReportingI18n;
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly linesResource = rxResource({
    stream: () => from(this.reportingService.getAccountBalances(this.accountingStore.accountingTenantId())),
  });
}
