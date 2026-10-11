import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular/standalone';

import { PrettyDatePipe } from '@okr/shared-pipes';
import { formatMinorAmount } from '@okr/shared-ui';

import { ApprovalBill, BillApprovalI18n } from '@okr/finance-bill-util';

/**
 * One booked bill as the payment_approver sees it (spec 1.94 §3.5): vendor and amount, dates, the paying account,
 * the creditor's IBAN and reference, the lines and the vouchers. Read-only, no outputs. The voucher URLs are signed
 * and expire after 10 minutes — they are rendered as plain links, never cached.
 */
@Component({
  selector: 'okr-bill-approval-card',
  standalone: true,
  imports: [PrettyDatePipe, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonList, IonItem, IonLabel, IonNote],
  styles: [`
    ion-card-title { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
    ion-note.amount { padding-inline-start: 8px; }
    a { color: var(--ion-color-primary); }
  `],
  template: `
    @let b = bill();
    <ion-card>
      <ion-card-header>
        <ion-card-title>
          <span>{{ b.vendorName }}</span>
          <span class="amount">{{ b.currency }} {{ fmt(b.amount) }}</span>
        </ion-card-title>
        <ion-card-subtitle>{{ b.billId }}{{ b.billId && b.title ? ' · ' : '' }}{{ b.title }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-list lines="none">
          <ion-item>
            <ion-label>{{ i18n().bill_date() }}</ion-label>
            <ion-note slot="end">{{ b.billDate | prettyDate }}</ion-note>
          </ion-item>
          <ion-item>
            <ion-label>{{ i18n().due_date() }}</ion-label>
            <ion-note slot="end">{{ b.dueDate | prettyDate }}</ion-note>
          </ion-item>
          @if (b.paymentAccountKey) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h3>{{ i18n().approval_payFrom() }}</h3>
                <p>{{ b.paymentAccountName }}{{ b.paymentAccountIban ? ' · ' + b.paymentAccountIban : '' }}</p>
              </ion-label>
            </ion-item>
          }
          @if (b.creditorIban) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h3>{{ i18n().approval_iban() }}</h3>
                <p>{{ b.creditorIban }}</p>
              </ion-label>
            </ion-item>
          }
          @if (b.paymentReference) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h3>{{ i18n().approval_reference() }}</h3>
                <p>{{ b.paymentReference }}</p>
              </ion-label>
            </ion-item>
          }
          @if (b.lines.length > 0) {
            <ion-item>
              <ion-label><h3>{{ i18n().approval_lines() }}</h3></ion-label>
            </ion-item>
            @for (line of b.lines; track $index) {
              <ion-item>
                <ion-label class="ion-text-wrap">{{ line.title }}</ion-label>
                <ion-note slot="end" class="amount">{{ fmt(line.amount) }}</ion-note>
              </ion-item>
            }
          }
          @if (b.vouchers.length > 0) {
            <ion-item>
              <ion-label><h3>{{ i18n().approval_vouchers() }}</h3></ion-label>
            </ion-item>
            @for (v of b.vouchers; track $index) {
              <ion-item>
                <ion-label class="ion-text-wrap"><a [href]="v.url" target="_blank" rel="noopener">{{ v.name }}</a></ion-label>
              </ion-item>
            }
          }
        </ion-list>
      </ion-card-content>
    </ion-card>
  `
})
export class BillApprovalCard {
  public readonly bill = input.required<ApprovalBill>();
  public readonly i18n = input.required<BillApprovalI18n>();

  protected fmt(minor: number): string {
    return formatMinorAmount(minor);
  }
}
