import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonButtons, IonCol, IonContent, IonFooter, IonGrid, IonItem, IonLabel, IonRow, IonTextarea, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ScsMemberFeesModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { getAccountDescription, MEMBERSHIP_I18N_KEYS } from '@okr/relationship-membership-util';
import { dismissOverlay } from '@okr/shared-util-angular';

export interface BexioPosition {
  text: string;
  unit_price: number;
  account_id: number;
  amount: number;
}

const DEFAULT_FOOTER = '<span>Vielen Dank f&uuml;r die Bezahlung der Rechnung innert 30 Tagen auf unser Konto bei der Z&uuml;rcher Kantonalbank IBAN CH67 0070 0110 4044 7417 6.<br /><br />Bitte verwende den QR-Code Einzahlungsschein auf der n&auml;chste Seite oder &uuml;berweise direkt auf die IBAN Nummer.<br /><br />Herzliche Gr&uuml;sse<br /><br />Seeclub St&auml;fa, Finanzen<br />Bruno Kaiser</span>';

@Component({
  selector: 'okr-scs-member-fee-upload-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Header,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonTextarea,
  ],
  styles: [`
    .field-label { font-size: 0.85rem; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .account { font-size: 0.8rem; color: var(--ion-color-medium); }
    .total-row ion-label { font-weight: bold; border-top: 1px solid var(--ion-color-medium); padding-top: 4px; }
    ion-textarea { --padding-top: 6px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col><strong>{{ name() }}</strong></ion-col>
        </ion-row>

        <!-- positions: text | amount | account -->
        @for (pos of positions(); track $index) {
          <ion-row>
            <ion-col size="4"><ion-label class="field-label">{{ pos.text }}</ion-label></ion-col>
            <ion-col size="2"><ion-label class="amount">{{ pos.unit_price }}</ion-label></ion-col>
            <ion-col size="6"><ion-label class="account">{{ account(pos.account_id) }}</ion-label></ion-col>
          </ion-row>
        }

        <ion-row class="total-row">
          <ion-col size="4"><ion-label><strong>Total</strong></ion-label></ion-col>
          <ion-col size="2"><ion-label class="amount"><strong>{{ total() }}</strong></ion-label></ion-col>
          <ion-col size="6"></ion-col>
        </ion-row>

        <!-- header textarea -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none">
              <ion-textarea
                label="Header"
                labelPlacement="floating"
                fill="outline"
                [autoGrow]="true"
                [rows]="3"
                [(ngModel)]="header"
              />
            </ion-item>
          </ion-col>
        </ion-row>

        <!-- footer textarea -->
        <ion-row>
          <ion-col size="12">
            <ion-item lines="none">
              <ion-textarea
                label="Footer"
                labelPlacement="floating"
                fill="outline"
                [autoGrow]="true"
                [rows]="5"
                [(ngModel)]="footer"
              />
            </ion-item>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button color="medium" (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button color="primary" (click)="confirm()">An Bexio senden</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class ScsMemberFeeUploadModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll({
    cancel: '@cancel',
    title: MEMBERSHIP_I18N_KEYS.scsMemberFee_upload_label,
  });

  public fee = input.required<ScsMemberFeesModel>();
  public positions = input.required<BexioPosition[]>();

  protected name = computed(() => this.fee().member?.label ?? '');
  protected total = computed(() =>
    this.positions().reduce((sum, p) => sum + p.unit_price * p.amount, 0)
  );
  protected account(id: number): string { return getAccountDescription(id); }

  protected header = '';
  protected footer = DEFAULT_FOOTER;

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  public async confirm(): Promise<void> {
    await dismissOverlay(this.modalController, { header: this.header, footer: this.footer }, 'confirm');
  }
}
