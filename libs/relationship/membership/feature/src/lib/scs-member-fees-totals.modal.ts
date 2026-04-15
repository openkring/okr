import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonContent, IonGrid, IonRow, IonCol, IonLabel, ModalController } from '@ionic/angular/standalone';

import { ScsMemberFeesModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-scs-member-fees-totals-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent,
    IonContent, IonGrid, IonRow, IonCol, IonLabel,
  ],
  styles: [`
    .label { font-weight: bold; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row ion-label { font-weight: bold; border-top: 2px solid var(--ion-color-medium); padding-top: 4px; }
  `],
  template: `
    <bk-header title="{{'@finance.scsMemberFee.operation.totals.label' | translate | async}}" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.jb.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().jb }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.srv.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().srv }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.entryFee.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().entryFee }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.locker.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().locker }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.skiff.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().skiff }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.skiffInsurance.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().skiffInsurance }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.bev.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().bev }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.rebate.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().rebate }}</ion-label></ion-col>
        </ion-row>
        <ion-row class="total-row">
          <ion-col size="6"><ion-label class="label">{{'@finance.scsMemberFee.field.total.label' | translate | async}}</ion-label></ion-col>
          <ion-col size="6"><ion-label class="amount">{{ totals().total }}</ion-label></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12">
            <ion-label color="medium">{{ fees().length }} {{'@finance.scsMemberFee.list.count' | translate | async}}</ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `
})
export class ScsMemberFeesTotalsModal {
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

  public async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
