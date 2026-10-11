import { Component, computed, inject, input, resource } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonLabel, IonList, IonListHeader, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill } from '@okr/shared-util-core';

import { BillService } from '@okr/finance-bill-data-access';
import { BillApprovalCard } from '@okr/finance-bill-ui';
import { BILL_APPROVAL_I18N_KEYS, BillApprovalI18n, groupApprovalBills } from '@okr/finance-bill-util';

/**
 * The payment_approver's read-only view of booked bills (spec 1.94 §3.5), reached from the daily task's links:
 * `/bill-approval/bill/:billKey` shows one bill, `/bill-approval/:accountingTenantId/:date` (yyyymmdd) the bills booked
 * on that day for those books (the legal entity; NOT the app tenant). Authorization lives in `getBillsForApproval`;
 * any refusal (no access, unknown or draft bill) shows the same error text.
 */
@Component({
  selector: 'okr-bill-approval-page',
  standalone: true,
  imports: [
    Spinner, EmptyList, BillApprovalCard,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonList, IonListHeader, IonLabel
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (result.isLoading() && !result.hasValue()) {
        <okr-spinner />
      } @else if (result.error()) {
        <okr-empty-list [message]="i18n.approval_error()" />
      } @else if (groups().length === 0) {
        <okr-empty-list [message]="i18n.approval_empty()" />
      } @else {
        @for (group of groups(); track $index) {
          <ion-list lines="none">
            @if (!billKey()) {
              <ion-list-header>
                <ion-label class="ion-text-wrap">{{ group.heading || i18n.approval_noAccount() }}</ion-label>
              </ion-list-header>
            }
            @for (bill of group.bills; track bill.okey) {
              <okr-bill-approval-card [bill]="bill" [i18n]="i18n" />
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class BillApprovalPage {
  private readonly billService = inject(BillService);
  protected readonly i18n = inject(I18nService).translateAll(BILL_APPROVAL_I18N_KEYS) as BillApprovalI18n;

  /** the books (route param) — never derived from the app tenant */
  public readonly accountingTenantId = input<string>('');
  /** the digest day, StoreDate yyyymmdd (route param) */
  public readonly date = input<string>('');
  /** a single bill (route param `bill/:billKey`) */
  public readonly billKey = input<string>('');

  protected readonly result = resource({
    // withComponentInputBinding sets the params of the other route to undefined — coalesce
    params: resourceParams(() => ({ books: this.accountingTenantId() ?? '', date: this.date() ?? '', billKey: this.billKey() ?? '' })),
    loader: ({ params }) => this.billService.getBillsForApproval(params.billKey
      ? { billKey: params.billKey } : { accountingTenantId: params.books, date: params.date }),
  });
  protected readonly groups = computed(() => groupApprovalBills(this.result.value()?.bills ?? []));

  protected readonly title = computed(() => {
    if (this.billKey()) return this.i18n.approval_title();
    const storeDate = this.date() ?? '';
    const date = convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
    return fill(this.i18n.approval_dayTitle(), { date });
  });
}
