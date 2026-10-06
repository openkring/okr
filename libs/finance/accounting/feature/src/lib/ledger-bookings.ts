import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonNote, ModalController } from '@ionic/angular/standalone';
import { combineLatest, of } from 'rxjs';

import { formatMinorAmount } from '@okr/shared-ui';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BookingStatus } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, hasRole } from '@okr/shared-util-core';
import { AccountService } from '@okr/finance-account-data-access';
import { BookingLineService, BookingService } from '@okr/finance-booking-data-access';
import { ACCOUNTING_I18N_KEYS, AccountingI18n, LedgerAccount, ledgerAccounts, ledgerBookings, paymentLabelText, storeDateYear } from '@okr/finance-accounting-util';

import { AccountingStore } from './accounting.store';

/**
 * The ledger side of a document in its view modal: the bookings of an invoice or bill, or
 * the booking accounts of a bill (which has no booking of its own). A booking is one row as in the
 * journal (date, Soll, Haben, text, amount — the document's own share where given); its link closes the modal and opens the unfiltered
 * journal in the booking's year with that booking selected. A bare account links to the journal
 * filtered on it.
 * Treasurer only — the journal, bookings and booking lines are not readable for anyone else.
 */
@Component({
  selector: 'okr-ledger-bookings',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonNote, IonButton, IonIcon],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-content { container-type: inline-size; }
    .row { display: grid; grid-template-columns: 5.5rem 1fr 1fr 2fr 6rem 28px; gap: 8px; align-items: start; padding: 6px 0; }
    .row + .row { border-top: 1px solid var(--ion-color-light-shade); }
    .row.head { font-size: 0.8rem; font-weight: 600; color: var(--ion-color-medium); padding-top: 0; }
    .account-name, .status { display: block; font-size: 0.75rem; color: var(--ion-color-medium); }
    .phone-accounts { display: none; font-size: 0.8rem; color: var(--ion-color-medium); }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    /* no room for the Soll/Haben columns on a narrow card: the account numbers lead the text there */
    @container (width <= 440px) {
      .row { grid-template-columns: 5rem 1fr 5.5rem 28px; }
      .debit, .credit { display: none; }
      .phone-accounts { display: block; }
    }
    .line { display: flex; align-items: center; gap: 8px; }
    .account { flex: 1; }
    ion-button { --padding-start: 4px; --padding-end: 4px; margin: 0; height: 24px; }
  `],
  template: `
    @if (isVisible()) {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ isBookingMode() ? i18n.ledger_bookings() : i18n.ledger_accounts() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if (ledger.error()) {
            <ion-note color="danger">{{ i18n.ledger_load_error() }}</ion-note>
          } @else if (isBookingMode()) {
            <div class="row head">
              <span>{{ i18n.ledger_date() }}</span>
              <span class="debit">{{ i18n.ledger_debit() }}</span>
              <span class="credit">{{ i18n.ledger_credit() }}</span>
              <span>{{ i18n.ledger_text() }}</span>
              <span class="amount">{{ i18n.ledger_amount() }}</span>
              <span></span>
            </div>
            @for (booking of bookings(); track booking.bookingKey) {
              <div class="row">
                <span>{{ viewDate(booking.date) }}</span>
                <span class="debit">
                  @for (account of booking.debit; track account.accountKey) {
                    <div>{{ account.accountId }}<span class="account-name">{{ account.accountName }}</span></div>
                  }
                </span>
                <span class="credit">
                  @for (account of booking.credit; track account.accountKey) {
                    <div>{{ account.accountId }}<span class="account-name">{{ account.accountName }}</span></div>
                  }
                </span>
                <span>
                  <span class="phone-accounts">{{ accountIds(booking.debit) }} / {{ accountIds(booking.credit) }}</span>
                  {{ bookingTitle(booking.title) }}
                  @if (booking.status !== 'posted') { <span class="status">{{ statusLabel(booking.status) }}</span> }
                </span>
                <span class="amount">{{ formatAmount(booking.amount) }}</span>
                <ion-button fill="clear" size="small" [title]="i18n.ledger_show_journal()" (click)="openBooking(booking.bookingKey, booking.date)">
                  <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
                </ion-button>
              </div>
            }
          } @else {
            @for (account of accounts(); track account.accountKey) {
              <div class="line">
                <span class="account">{{ account.accountId }} {{ account.accountName }}</span>
                <ion-button fill="clear" size="small" [title]="i18n.ledger_show_journal()" (click)="openJournal(account.accountKey, date())">
                  <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
                </ion-button>
              </div>
            }
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class LedgerBookings {
  private readonly appStore = inject(AppStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly bookingService = inject(BookingService);
  private readonly bookingLineService = inject(BookingLineService);
  private readonly accountService = inject(AccountService);
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  // direct inject: this component sits in modals the feature stores open
  protected readonly i18n = inject(I18nService).translateAll(ACCOUNTING_I18N_KEYS) as AccountingI18n;

  public readonly accountingTenantId = input.required<string>();
  /** booking okeys in ledger order (invoice); takes precedence over accountKeys */
  public readonly bookingKeys = input<string[]>([]);
  /** the document's own share of a booking (bookingKey → minor units), e.g. its part of a collective payment */
  public readonly bookingAmounts = input<Record<string, number>>({});
  /** account okeys without bookings (bill) */
  public readonly accountKeys = input<string[]>([]);
  /** StoreDate whose year the journal opens on for accountKeys (e.g. the bill date) */
  public readonly date = input<string>('');

  protected readonly isTreasurer = computed(() => hasRole('treasurer', this.appStore.currentUser()));
  protected readonly isBookingMode = computed(() => this.bookingKeys().length > 0);

  // the same cached tenant-wide streams the journal reads; bookings only when there are keys to look up
  protected readonly ledger = rxResource({
    params: resourceParams(() => ({
      accountingTenantId: this.accountingTenantId(),
      withBookings: this.isBookingMode(),
      enabled: this.isTreasurer() && (this.isBookingMode() || this.accountKeys().length > 0),
    })),
    stream: ({ params }) => {
      if (!params.enabled || !params.accountingTenantId) return of(undefined);
      return combineLatest({
        accounts: this.accountService.list(params.accountingTenantId),
        bookings: params.withBookings ? this.bookingService.list(params.accountingTenantId) : of([]),
        lines: params.withBookings ? this.bookingLineService.list(params.accountingTenantId) : of([]),
      });
    },
  });

  protected readonly bookings = computed(() => {
    const data = this.ledger.value();
    return data ? ledgerBookings(this.bookingKeys(), data.bookings, data.lines, data.accounts, this.bookingAmounts()) : [];
  });
  protected readonly accounts = computed(() => ledgerAccounts(this.accountKeys(), this.ledger.value()?.accounts ?? []));
  protected readonly isVisible = computed(() =>
    this.isTreasurer() && (this.ledger.error() !== undefined || (this.isBookingMode() ? this.bookings().length > 0 : this.accounts().length > 0)));

  protected viewDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
  }

  /** bexio's "Zahlungseingang" / "Zahlungsausgang" as the configured labels (GS / BA) — display only */
  protected bookingTitle(title: string): string {
    return paymentLabelText(title, this.accountingStore.config());
  }

  protected accountIds(accounts: LedgerAccount[]): string {
    return accounts.map(a => a.accountId).join(', ');
  }

  protected formatAmount(minor: number): string {
    return formatMinorAmount(minor);
  }

  protected statusLabel(status: BookingStatus): string {
    switch (status) {
      case 'draft': return this.i18n.ledger_status_draft();
      case 'forReview': return this.i18n.ledger_status_forReview();
      case 'cancelled': return this.i18n.ledger_status_cancelled();
    }
    return status;
  }

  /** Closes the view modal and opens the unfiltered journal in the booking's year, with the booking selected. */
  protected async openBooking(bookingKey: string, storeDate: string): Promise<void> {
    const year = storeDateYear(storeDate);
    await this.modalController.dismiss().catch(() => undefined);
    await this.router.navigate(['/accounting', this.accountingTenantId(), 'journal', 'c-journal'],
      { queryParams: { bookingKey, ...(year ? { year } : {}) } });
  }

  /** Closes the view modal and opens the journal filtered on the account, in the year of `storeDate`. */
  protected async openJournal(accountKey: string, storeDate: string): Promise<void> {
    if (!accountKey) return;
    const year = storeDateYear(storeDate);
    await this.modalController.dismiss().catch(() => undefined);
    await this.router.navigate(['/accounting', this.accountingTenantId(), 'journal', 'c-journal'],
      { queryParams: { accountKey, ...(year ? { year } : {}) } });
  }
}
