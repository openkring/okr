import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonContent, IonGrid, IonRow, IonCol, IonLabel, ModalController } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { ScsMemberFeesModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';

const PFX = '@finance.scsMemberFee.';

const ScsMemberFeesTotalsStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      totals_label:       PFX + 'operation.totals.label',
      field_jb:           PFX + 'field.jb.label',
      field_srv:          PFX + 'field.srv.label',
      field_entry_fee:    PFX + 'field.entryFee.label',
      field_locker:       PFX + 'field.locker.label',
      field_skiff:        PFX + 'field.skiff.label',
      field_skiff_ins:    PFX + 'field.skiffInsurance.label',
      field_bev:          PFX + 'field.bev.label',
      field_rebate:       PFX + 'field.rebate.label',
      field_total:        PFX + 'field.total.label',
    }),
  })),
);

const CHF = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Component({
  selector: 'bk-scs-member-fees-totals-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ScsMemberFeesTotalsStore],
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
    <bk-header [title]="store.i18n.totals_label()" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_jb() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().jb) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_srv() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().srv) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_entry_fee() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().entryFee) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_locker() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().locker) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_skiff() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().skiff) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_skiff_ins() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().skiffInsurance) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_bev() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().bev) }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label>{{ store.i18n.field_rebate() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().rebate) }}</ion-label></ion-col>
        </ion-row>

        <!-- total -->
        <ion-row class="divider">
          <ion-col size="6"><ion-label class="label">{{ store.i18n.field_total() }}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ fmt(totals().total) }}</ion-label></ion-col>
        </ion-row>

        <!-- status overview -->
        <ion-row>&nbsp;</ion-row>

        <ion-row>
          <ion-col size="6"><ion-label class="status-header">Stati</ion-label></ion-col>
          <ion-col size="3"><ion-label class="status-header ion-text-end">Anzahl</ion-label></ion-col>
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
export class ScsMemberFeesTotalsModal {
  protected readonly store = inject(ScsMemberFeesTotalsStore);
  private readonly modalController = inject(ModalController);

  public fees = input.required<ScsMemberFeesModel[]>();

  protected totals = computed(() => {
    const fees = this.fees();
    const sum = (field: keyof Pick<ScsMemberFeesModel, 'jb' | 'srv' | 'entryFee' | 'locker' | 'skiff' | 'skiffInsurance' | 'bev' | 'rebate'>) =>
      fees.reduce((acc, f) => acc + (f[field] ?? 0), 0);

    const jb = sum('jb');
    const srv = sum('srv');
    const entryFee = sum('entryFee');
    const locker = sum('locker');
    const skiff = sum('skiff');
    const skiffInsurance = sum('skiffInsurance');
    const bev = sum('bev');
    const rebate = sum('rebate');
    const total = jb + srv + entryFee + locker + skiff + skiffInsurance + bev - rebate;
    return { jb, srv, entryFee, locker, skiff, skiffInsurance, bev, rebate, total };
  });

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
    await this.modalController.dismiss(null, 'cancel');
  }
}
