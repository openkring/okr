import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonItem, IonLabel, IonNote } from '@ionic/angular';

import {
  chfFrancs, chfRappen, ExitSettlement, ExitSettlementI18n, fillExitText, manualReasonText, SettlementChoice,
} from '@okr/relationship-membership-util';

/**
 * The decision UI of an exit settlement task (spec 1.105): the figures of the pro-rata computation and
 * one button per offered choice. Like `ApprovalDecisionCard` it is NOT an edit form (no change
 * confirmation): the buttons hold the decisions. It only emits `chosen`; the host confirms and calls the
 * callable.
 */
@Component({
  selector: 'okr-exit-settlement-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonItem, IonLabel, IonNote, IonButton],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .decisions { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 16px 16px; }
    .decisions ion-button { flex: 1; }
  `],
  template: `
    <ion-card>
      <ion-card-content class="ion-no-padding">
        <ion-item lines="none">
          <ion-label><h2>{{ i18n().title() }}</h2></ion-label>
        </ion-item>
        @if (settlement().yearlyFr > 0) {
          <ion-item lines="none">
            <ion-label>
              <p>{{ i18n().yearly() }}</p>
              <h3>CHF {{ yearly() }} · {{ monthsText() }}</h3>
            </ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-label>
              <p>{{ i18n().due() }}</p>
              <h3>CHF {{ due() }}</h3>
            </ion-label>
          </ion-item>
        }
        @if (settlement().invoice; as invoice) {
          @if (settlement().case !== 'manual') {
            <ion-item lines="none">
              <ion-label>
                <p>{{ i18n().billed() }}</p>
                <h3>CHF {{ billed() }}</h3>
                @if (settlement().shape === 'bexio') { <ion-note>{{ i18n().assumption() }}</ion-note> }
              </ion-label>
            </ion-item>
          }
          <ion-item lines="none">
            <ion-label>
              <p>{{ i18n().paid() }}</p>
              <h3>CHF {{ paid() }} / {{ total() }}</h3>
            </ion-label>
          </ion-item>
        }
        @if (hint()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap"><ion-note color="warning">{{ hint() }}</ion-note></ion-label>
          </ion-item>
        }
        @if (done()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">
              <p>{{ i18n().done() }}</p>
              <h3>{{ decision() }}</h3>
            </ion-label>
          </ion-item>
        }
        @if (!done()) {
          @if (settlement().choices.length === 0) {
            <ion-item lines="none"><ion-label class="ion-text-wrap"><ion-note>{{ i18n().no_action() }}</ion-note></ion-label></ion-item>
          } @else {
            <div class="decisions">
              @for (choice of settlement().choices; track choice) {
                <ion-button [color]="choice === 'refund' ? 'success' : 'primary'" [fill]="choice === 'extend' ? 'outline' : 'solid'"
                  [disabled]="busy()" (click)="chosen.emit(choice)">{{ label(choice) }}</ion-button>
              }
            </div>
          }
        }
      </ion-card-content>
    </ion-card>

  `
})
export class ExitSettlementCard {
  // inputs
  public readonly settlement = input.required<ExitSettlement>();
  public readonly i18n = input.required<ExitSettlementI18n>();
  /** the task is already decided: the stored decision line replaces the buttons */
  public readonly done = input(false);
  public readonly decision = input('');
  public readonly busy = input(false);

  // outputs
  public readonly chosen = output<SettlementChoice>();

  // derived
  protected readonly yearly = computed(() => chfFrancs(this.settlement().yearlyFr));
  protected readonly due = computed(() => chfFrancs(this.settlement().dueFr));
  protected readonly billed = computed(() => chfFrancs(this.settlement().billedFr));
  protected readonly paid = computed(() => chfRappen(this.settlement().invoice?.paidRappen ?? 0));
  protected readonly total = computed(() => chfRappen(this.settlement().invoice?.totalRappen ?? 0));
  protected readonly monthsText = computed(() => fillExitText(this.i18n().months(), { months: this.settlement().months }));
  protected readonly hint = computed(() => {
    const s = this.settlement();
    return s.case === 'partial-short' ? this.i18n().partial_short() : manualReasonText(this.i18n(), s.manualReason);
  });

  protected label(choice: SettlementChoice): string {
    const s = this.settlement();
    switch (choice) {
      case 'refund': return fillExitText(this.i18n().refund(), { amount: chfRappen(s.refundRappen) });
      case 'adjust-invoice': return this.i18n().adjust();
      default: return fillExitText(this.i18n().extend(), { year: s.exitYear });
    }
  }
}
