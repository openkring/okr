import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonContent, IonGrid, IonRow, IonCol, IonLabel, ModalController } from '@ionic/angular/standalone';

import { MemberFeeModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { getFeeTotal } from '@okr/relationship-membership-util';

import { MemberFeesStore } from './member-fee.store';

const CHF = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Component({
  selector: 'okr-member-fees-totals-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MemberFeesStore],
  imports: [
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonLabel,
  ],
  styles: [`
    .label { font-weight: bold; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; width: 100%; display: block; }
    .status-row ion-label { border-top: 1px solid var(--ion-color-light); padding-top: 4px; }
    .status-header { text-align: right; font-weight: bold;}
    .divider ion-label { border-top: 2px solid var(--ion-color-medium); padding-top: 4px; }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.memberFee_totals_label() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-grid>
        @for (row of totals(); track row.key) {
          <ion-row>
            <ion-col size="6"><ion-label>{{ row.label }}</ion-label></ion-col>
            <ion-col size="6"><ion-label class="amount">{{ fmt(row.amount) }}</ion-label></ion-col>
          </ion-row>
        }

        <!-- total -->
        <ion-row class="divider">
          <ion-col size="6"><ion-label class="label">{{ store.i18n.memberFee_total() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(grandTotal()) }}</ion-label></ion-col>
        </ion-row>

        <!-- status overview -->
        <ion-row>&nbsp;</ion-row>

        <ion-row>
          <ion-col size="6"><ion-label class="status-header">Stati</ion-label></ion-col>
          <ion-col size="3"><ion-label class="status-header ion-text-end">{{ store.i18n.count_label() }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="status-header ion-text-end">%</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>initial</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().initial.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().initial.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>review</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().review.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().review.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>ready</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().ready.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().ready.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>uploaded</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().uploaded.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().uploaded.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>sent</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().sent.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().sent.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>paid</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().paid.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().paid.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="status-row">
          <ion-col size="6"><ion-label>cancelled</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().cancelled.n }}</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ statusCounts().cancelled.pct }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="divider">
          <ion-col size="6"><ion-label class="label">Total</ion-label></ion-col>
          <ion-col size="3"><ion-label class="amount">{{ fees().length }}</ion-label></ion-col>
          <ion-col size="3"></ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `
})
export class MemberFeesTotalsModal {
  protected readonly store = inject(MemberFeesStore);
  private readonly modalController = inject(ModalController);

  public fees = input.required<MemberFeeModel[]>();

  /**
   * One row per position key the fee schedule actually produced — no fixed set of eight columns
   * any more. A `rebate` position subtracts, exactly as `getFeeTotal` treats it.
   */
  protected totals = computed((): { key: string; label: string; amount: number }[] => {
    const rows = new Map<string, { key: string; label: string; amount: number }>();
    for (const fee of this.fees()) {
      for (const position of fee.positions ?? []) {
        const key = position.key || position.usage;
        const row = rows.get(key) ?? { key, label: position.label || key, amount: 0 };
        row.amount += position.type === 'rebate' ? -position.amount : position.amount;
        rows.set(key, row);
      }
    }
    return [...rows.values()];
  });

  protected grandTotal = computed(() =>
    this.fees().reduce((sum, fee) => sum + getFeeTotal(fee.positions ?? []), 0));

  protected statusCounts = computed(() => {
    const fees = this.fees();
    const total = fees.length;
    const pct = (n: number) => `${total > 0 ? ((n / total) * 100).toFixed(1) : '0.0'} %`;
    const entry = (state: string) => { const n = fees.filter(f => f.state === state).length; return { n, pct: pct(n) }; };
    return {
      initial: entry('initial'),
      review: entry('review'),
      ready: entry('ready'),
      uploaded: entry('uploaded'),
      sent: entry('sent'),
      paid: entry('paid'),
      cancelled: entry('cancelled')
    };
  });

  protected fmt(value: number): string {
    return CHF.format(value);
  }

  public async close(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }
}
