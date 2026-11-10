// libs/finance/collection/feature/src/lib/billing-board.page.ts
import { Component, computed, inject } from '@angular/core';
import {
  IonButton, IonButtons, IonChip, IonContent, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption, IonSpinner,
} from '@ionic/angular';

import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import {
  aboStateKey, AboStateKey, BillingOverviewRow, BoardStateFilter, formatChfAmount,
} from '@okr/finance-collection-util';

import { BillingBoardStore } from './billing-board.store';

const STATE_FILTERS: AboStateKey[] = ['active', 'pastDue', 'closing', 'closed', 'cancelled', 'exempt'];

/**
 * `/billing/board` (operator): all tenants' subscriptions with state, band, options, open amount, failed attempts,
 * credit and flags (a tap on a flag removes it after a confirmation). The route admits an admin or a treasurer; a
 * non-operator gets «Nur für bkaiser.» from the server.
 */
@Component({
  selector: 'okr-billing-board-page',
  standalone: true,
  providers: [BillingBoardStore],
  imports: [
    Header,
    IonContent, IonList, IonItem, IonLabel, IonNote, IonButtons, IonButton, IonSpinner, IonSelect, IonSelectOption, IonChip,
  ],
  styles: [`
    .amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .filters { display: flex; flex-wrap: wrap; gap: 0 16px; padding: 0 16px; }
    .filters ion-select { min-width: 180px; }
    ion-chip { margin: 2px 4px 2px 0; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" />
    <ion-content>
      @if (store.loading() && store.rows().length === 0) {
        <ion-item lines="none">
          <ion-spinner slot="start" name="crescent" />
          <ion-label>{{ i18n.loading() }}</ion-label>
        </ion-item>
      } @else if (store.loadError() === 'forbidden') {
        <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n.board_forbidden() }}</ion-label></ion-item>
      } @else if (store.loadError() === 'error') {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ i18n.error_generic() }}</ion-label>
          <ion-button slot="end" fill="outline" [disabled]="store.loading()" (click)="store.load()">{{ i18n.pay_retry() }}</ion-button>
        </ion-item>
      } @else {
        <div class="filters">
          <ion-select [label]="i18n.board_filter_state()" labelPlacement="floating" interface="popover"
            [value]="store.stateFilter()" (ionChange)="store.setStateFilter($event.detail.value)">
            <ion-select-option value="all">{{ i18n.board_filter_all() }}</ion-select-option>
            @for (s of stateFilters; track s) {
              <ion-select-option [value]="s">{{ stateLabel(s) }}</ion-select-option>
            }
          </ion-select>
          <ion-select [label]="i18n.board_filter_flag()" labelPlacement="floating" interface="popover"
            [value]="store.flagFilter()" (ionChange)="store.setFlagFilter($event.detail.value)">
            <ion-select-option value="all">{{ i18n.board_filter_all() }}</ion-select-option>
            @for (f of store.flags(); track f) {
              <ion-select-option [value]="f">{{ flagLabel(f) }}</ion-select-option>
            }
          </ion-select>
        </div>
        <ion-list>
          @for (row of store.filteredRows(); track row.tenantId) {
            <ion-item>
              <ion-label class="ion-text-wrap">
                <h2>{{ row.name }} <ion-note>({{ row.tenantId }})</ion-note></h2>
                <p>{{ stateLabel(stateOf(row)) }}@if (row.band) { · {{ row.band }} }@if (row.autopay) { · {{ i18n.board_autopay() }} }</p>
                @if (row.options.length > 0) { <p>{{ optionsText(row) }}</p> }
                @if (row.lastInvoice; as last) { <p>{{ lastInvoiceText(last) }}</p> }
                <p class="amount">
                  {{ amountText(i18n.board_open(), row.openAmount) }} · {{ amountText(i18n.board_credit(), row.creditBalance) }}
                  @if (row.failedAttempts > 0) { · {{ countText(i18n.board_failed(), row.failedAttempts) }} }
                  @if (row.excludedUsers > 0) { · {{ countText(i18n.board_excluded(), row.excludedUsers) }} }
                </p>
                @if (row.flags.length > 0) {
                  <div>
                    @for (flag of row.flags; track flag) {
                      <ion-chip color="warning" [outline]="true" [disabled]="store.busy()" (click)="store.clearFlag(row, flag)"
                        [attr.aria-label]="i18n.board_flag_clear() + ': ' + flagLabel(flag)" [title]="i18n.board_flag_clear()">
                        <ion-label>{{ flagLabel(flag) }} ×</ion-label>
                      </ion-chip>
                    }
                  </div>
                }
              </ion-label>
              <ion-buttons slot="end" class="actions">
                @if (row.billing !== 'stripe') {
                  <ion-button fill="outline" [disabled]="store.busy()" (click)="store.switchToStripe(row)">{{ i18n.board_to_stripe() }}</ion-button>
                } @else {
                  @if (row.state !== 'active') {
                    <ion-button fill="outline" [disabled]="store.busy()" (click)="store.reactivate(row)">{{ i18n.board_reactivate() }}</ion-button>
                  }
                  @if (row.state !== 'cancelled') {
                    <ion-button fill="clear" color="danger" [disabled]="store.busy()" (click)="store.cancelSubscription(row)">{{ i18n.board_cancel() }}</ion-button>
                  }
                }
              </ion-buttons>
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-note>{{ i18n.board_empty() }}</ion-note></ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class BillingBoardPage {
  protected readonly store = inject(BillingBoardStore);
  protected readonly i18n = this.store.i18n;
  protected readonly stateFilters = STATE_FILTERS;

  /** the count only once the board loaded: a forbidden or failed load has nothing to count */
  protected readonly title = computed(() => this.store.loadError() || (this.store.loading() && this.store.rows().length === 0)
    ? this.i18n.board_title()
    : `${this.store.filteredRows().length}/${this.store.rows().length} ${this.i18n.board_title()}`);

  protected stateOf(row: BillingOverviewRow): AboStateKey {
    return aboStateKey(row);
  }

  protected stateLabel(state: BoardStateFilter): string {
    switch (state) {
      case 'exempt': return this.i18n.board_state_exempt();
      case 'active': return this.i18n.board_state_active();
      case 'pastDue': return this.i18n.board_state_pastDue();
      case 'closing': return this.i18n.board_state_closing();
      case 'closed': return this.i18n.board_state_closed();
      case 'cancelled': return this.i18n.board_state_cancelled();
      default: return this.i18n.board_filter_all();
    }
  }

  /** the German label of an operator flag; an unknown flag shows its id */
  protected flagLabel(flag: string): string {
    return this.store.flagLabel(flag);
  }

  protected optionsText(row: BillingOverviewRow): string {
    return fill(this.i18n.board_options(), { options: row.options.map(o => this.store.optionName(o)).join(', ') });
  }

  protected lastInvoiceText(last: NonNullable<BillingOverviewRow['lastInvoice']>): string {
    return fill(this.i18n.board_last_invoice(), { no: last.no || last.key, amount: formatChfAmount(last.amount) });
  }

  protected amountText(template: string, rappen: number): string {
    return fill(template, { amount: formatChfAmount(rappen) });
  }

  protected countText(template: string, count: number): string {
    return fill(template, { count });
  }
}
