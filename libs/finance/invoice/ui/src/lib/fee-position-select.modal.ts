import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { proRataDescription } from '@okr/shared-util-core';

import { FeePickOption, InvoiceI18n } from '@okr/finance-invoice-util';

/**
 * Picks one position of the current year's fee schedule for an invoice (spec 1.78). A selection
 * list, not an input form: a tap dismisses with the option, the header's close button cancels.
 * A category position for a receiver who is not a member is shown but cannot be picked.
 */
@Component({
  selector: 'okr-fee-position-select-modal',
  standalone: true,
  imports: [Header, IonContent, IonList, IonItem, IonLabel, IonNote],
  styles: [`
    .warning { color: var(--ion-color-warning-shade); }
    .empty { padding: 16px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().feeSelect_title() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if (options().length === 0) {
        <p class="empty">{{ i18n().feeSelect_empty() }}</p>
      } @else {
        <ion-list lines="inset">
          @for (option of options(); track $index) {
            <ion-item [button]="!option.disabledReason" [disabled]="!!option.disabledReason" (click)="pick(option)">
              <ion-label class="ion-text-wrap">
                <h3>{{ option.rule.label || option.rule.key }}</h3>
                @if (option.disabledReason === 'notMember') {
                  <p>{{ i18n().feeSelect_notMember() }}</p>
                } @else if (option.missingAccount) {
                  <p class="warning">{{ i18n().feeSelect_noAccount() }}</p>
                }
                @if (option.proRataMonths) {
                  <p>{{ proRataText(option.proRataMonths, option.yearlyAmount) }}</p>
                }
              </ion-label>
              @if (!option.disabledReason) {
                <ion-note slot="end">CHF {{ formatAmount(option.amount) }}</ion-note>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FeePositionSelectModal {
  private readonly modalController = inject(ModalController);

  public readonly options = input<FeePickOption[]>([]);
  public readonly i18n = input.required<InvoiceI18n>();

  /** the same text the position carries onto the invoice */
  protected proRataText(months: number, yearlyAmount?: number): string {
    return proRataDescription(months, yearlyAmount);
  }

  protected formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  protected async pick(option: FeePickOption): Promise<void> {
    if (option.disabledReason) return;
    await dismissOverlay(this.modalController, option, 'confirm');
  }
}
