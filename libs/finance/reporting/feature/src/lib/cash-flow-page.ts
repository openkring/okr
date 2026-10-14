import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonButtons, IonMenuButton, IonItem, IonItemDivider, IonLabel, IonList, IonNote,
  IonSelect, IonSelectOption, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular';
import { from, of } from 'rxjs';

import { AccountModel, BookingLineModel, BookingModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { getTodayStr } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { AccountingBooks, AccountingSegments, AccountingStore } from '@okr/finance-accounting-feature';
import { AccountService } from '@okr/finance-account-data-access';
import { BookingLineService, BookingPage, BookingService } from '@okr/finance-booking-data-access';
import { cashFlowDirect, fiscalYearOptions, isCashAccount } from '@okr/finance-accounting-util';
import { formatMinorAmount, openingBalance } from '@okr/finance-booking-util';
import { fiscalYear, fiscalYearOf, REPORTING_I18N_KEYS, ReportingI18n } from '@okr/finance-reporting-util';

interface PeriodData { accounts: AccountModel[]; bookings: BookingModel[]; lines: BookingLineModel[] }

/**
 * Geldflussrechnung, direct method: the fiscal year's movements on the cash accounts (1000–1059),
 * per counter account (`cashFlowDirect`). The year is read page by page like the journal (spec 1.102);
 * the opening balance — the cash accounts' history before the year — follows separately, so the flows
 * show without waiting for it.
 */
@Component({
  selector: 'okr-cash-flow-page',
  standalone: true,
  imports: [AccountingSegments, AccountingBooks, IonHeader, IonButtons, IonMenuButton, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonItemDivider, IonLabel, IonNote, IonSelect, IonSelectOption, IonSpinner],
  styles: [`
    .explain { padding: 12px 16px 0; color: var(--ion-color-medium-shade); }
    .amount { font-variant-numeric: tabular-nums; }
    .total { font-weight: 600; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.cashflow_title() }} {{ yearLabel() }}</ion-title>
        <okr-accounting-books slot="end" />
      </ion-toolbar>
      <okr-accounting-segments />
    </ion-header>
    <ion-content>
      <p class="explain">{{ i18n.cashflow_explain() }}</p>
      <ion-list>
        <ion-item>
          <ion-select interface="popover" [label]="i18n.cashflow_year()" [value]="year()" (ionChange)="selectedYear.set(+$event.detail.value)">
            @for (y of yearOptions(); track y) { <ion-select-option [value]="y">{{ y }}</ion-select-option> }
          </ion-select>
        </ion-item>
      </ion-list>

      @if (periodResource.isLoading()) {
        <div class="ion-text-center ion-padding"><ion-spinner name="dots" /></div>
      } @else if (statement(); as s) {
        <ion-list>
          <ion-item lines="full">
            <ion-label>{{ i18n.cashflow_opening() }}</ion-label>
            <ion-note slot="end" class="amount">@if (openingResource.isLoading()) { <ion-spinner name="dots" /> } @else { {{ money(s.opening) }} }</ion-note>
          </ion-item>

          <ion-item-divider color="light"><ion-label>{{ i18n.cashflow_inflows() }}</ion-label></ion-item-divider>
          @for (r of s.inflows; track r.accountKey) {
            <ion-item><ion-label>{{ r.accountId }} {{ r.accountName }}</ion-label><ion-note slot="end" class="amount">{{ money(r.amount) }}</ion-note></ion-item>
          }
          <ion-item class="total"><ion-label>{{ i18n.cashflow_totalIn() }}</ion-label><ion-note slot="end" class="amount">{{ money(s.totalIn) }}</ion-note></ion-item>

          <ion-item-divider color="light"><ion-label>{{ i18n.cashflow_outflows() }}</ion-label></ion-item-divider>
          @for (r of s.outflows; track r.accountKey) {
            <ion-item><ion-label>{{ r.accountId }} {{ r.accountName }}</ion-label><ion-note slot="end" class="amount">−{{ money(r.amount) }}</ion-note></ion-item>
          }
          <ion-item class="total"><ion-label>{{ i18n.cashflow_totalOut() }}</ion-label><ion-note slot="end" class="amount">−{{ money(s.totalOut) }}</ion-note></ion-item>

          <ion-item-divider color="light" />
          <ion-item class="total"><ion-label>{{ i18n.cashflow_net() }}</ion-label><ion-note slot="end" class="amount">{{ money(s.net) }}</ion-note></ion-item>
          <ion-item class="total" lines="full">
            <ion-label>{{ i18n.cashflow_closing() }}</ion-label>
            <ion-note slot="end" class="amount">@if (openingResource.isLoading()) { <ion-spinner name="dots" /> } @else { {{ money(s.closing) }} }</ion-note>
          </ion-item>
          @if (s.internalTransfers > 0) {
            <ion-item lines="none"><ion-label class="ion-text-wrap"><p>{{ i18n.cashflow_internal() }}: {{ money(s.internalTransfers) }}</p></ion-label></ion-item>
          }
          @if (s.inflows.length === 0 && s.outflows.length === 0) {
            <ion-item lines="none"><ion-label class="ion-text-wrap"><p>{{ i18n.cashflow_empty() }}</p></ion-label></ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class CashFlowPage {
  protected readonly i18n = inject(I18nService).translateAll(REPORTING_I18N_KEYS) as ReportingI18n;
  private readonly accountingStore = inject(AccountingStore);
  private readonly accountService = inject(AccountService);
  private readonly bookingService = inject(BookingService);
  private readonly bookingLineService = inject(BookingLineService);

  private readonly fiscalYearStart = computed(() => this.accountingStore.config()?.fiscalYearStart ?? 1);
  private readonly currentYear = computed(() => fiscalYearOf(getTodayStr(), this.fiscalYearStart()));
  protected readonly selectedYear = signal(0);
  protected readonly year = computed(() => this.selectedYear() || this.currentYear());
  protected readonly yearOptions = computed(() => fiscalYearOptions(this.currentYear(), 10));
  private readonly range = computed(() => fiscalYear(this.year(), this.fiscalYearStart()));
  protected readonly yearLabel = computed(() => this.range().label);

  private readonly params = resourceParams(() => ({
    books: this.accountingStore.accountingTenantId(),
    userKey: this.accountingStore.currentUser()?.okey ?? '',
    from: this.range().from,
    to: this.range().to,
  }));

  protected readonly periodResource = rxResource({
    params: () => this.params(),
    stream: ({ params }) => params.books && params.userKey ? from(this.loadPeriod(params.books, params.from, params.to)) : of(undefined),
  });

  protected readonly openingResource = rxResource({
    params: () => ({ ...this.params(), accounts: this.periodResource.hasValue() ? this.periodResource.value()?.accounts : undefined }),
    stream: ({ params }) => params.books && params.accounts ? from(this.loadOpening(params.books, params.accounts, params.from)) : of(undefined),
  });

  protected readonly statement = computed(() => {
    const data = this.periodResource.hasValue() ? this.periodResource.value() : undefined;
    if (!data) return undefined;
    const opening = this.openingResource.hasValue() ? this.openingResource.value() : undefined;
    return cashFlowDirect(data.bookings, data.lines, data.accounts, this.range().from, this.range().to, opening);
  });

  protected money(minor: number | undefined): string {
    return minor === undefined ? '—' : formatMinorAmount(minor);
  }

  /** the fiscal year's bookings and their lines, page by page (one-shot) */
  private async loadPeriod(books: string, from: string, to: string): Promise<PeriodData> {
    const accounts = await this.accountService.listOnce(books);
    const bookings: BookingModel[] = [];
    const lines: BookingLineModel[] = [];
    let cursor: BookingPage['cursor'];
    do {
      const page = await this.bookingService.listPage(books, from, to, cursor);
      bookings.push(...page.bookings);
      lines.push(...await this.bookingLineService.listForBookings(books, page.bookings.map(b => b.okey)));
      cursor = page.cursor;
    } while (cursor);
    return { accounts, bookings, lines };
  }

  /** cash at the start of the year: every cash account's posted lines before it (balance-sheet accounts carry forward) */
  private async loadOpening(books: string, accounts: AccountModel[], before: string): Promise<number> {
    const cashAccounts = accounts.filter(isCashAccount);
    const [prior, ...linesPerAccount] = await Promise.all([
      this.bookingService.listBefore(books, '', before),
      ...cashAccounts.map(a => this.bookingLineService.listForAccount(books, a.okey)),
    ]) as [BookingModel[], ...BookingLineModel[][]];
    return cashAccounts.reduce((sum, a, i) => sum + openingBalance(linesPerAccount[i], prior, a.okey, a.id, '', before), 0);
  }
}
