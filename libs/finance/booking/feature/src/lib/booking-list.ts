import { Component, computed, effect, ElementRef, inject, input, signal, untracked } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingLineModel, BookingModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { ListFilter } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { BookingAction, isForReview, JournalRow, sideAccountKeys } from '@okr/finance-booking-util';
import { BookingStore } from './booking.store';

type JournalSortField = 'date' | 'haben' | 'soll' | 'text' | 'amount';

/** JournalRow.amount is display-formatted (e.g. 1'234.50); strip grouping for a numeric sort. */
function parseAmount(amount: string): number {
  return Number((amount ?? '').replace(/[^\d.-]/g, '')) || 0;
}

@Component({
  selector: 'okr-booking-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu, ListFilter, ReadOnlyBanner,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonItemDivider, IonLabel, IonIcon, IonButton, IonButtons, IonMenuButton,
    IonPopover, IonGrid, IonRow, IonCol, IonNote,
  ],
  providers: [BookingStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>
        {{ filteredCount() }}/{{ count() }} {{ store.i18n.list_title() }}
        @if(store.accountLabel(); as accountLabel) {
          <span class="account-badge">
            {{ accountLabel }}
            <ion-icon class="badge-clear" src="{{ 'cancel' | svgIcon }}" (click)="store.clearAccountFilter()" [attr.aria-label]="store.i18n.cancel()" />
          </span>
        }
        @if(store.monthLabel(); as monthLabel) {
          <span class="account-badge">
            {{ monthLabel }}
            <ion-icon class="badge-clear" src="{{ 'cancel' | svgIcon }}" (click)="store.clearMonthFilter()" [attr.aria-label]="store.i18n.cancel()" />
          </span>
        }
        @if(forReviewCount() > 0) {
          <span class="review-badge">{{ forReviewCount() }} {{ store.i18n.review_badge() }}</span>
        }
      </ion-title>
      @if(hasRole('privileged') || hasRole('admin')) {
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName()" [excludeNames]="excludedMenuItems()" [toggleStates]="{ toggleSaldo: store.showSaldo(), toggleMonthGroups: store.groupByMonth() }" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      }
    </ion-toolbar>

    <!-- filters -->
    <okr-list-filter
      (searchTermChanged)="store.setSearchTerm($event)"
      (yearChanged)="store.setSelectedYear($event)" [years]="years()" [selectedYear]="store.selectedYear()"
      (stateChanged)="store.setSelectedStatus($event)" [states]="statusCategory()" [selectedState]="store.selectedStatus()"
    />

    <!-- list header -->
    <ion-toolbar color="primary">
      <ion-grid>
        <ion-row>
          <ion-col size="3" size-md="2" class="clickable" (click)="setSort('date')"><ion-label><strong>{{ store.i18n.col_date() }}{{ sortIcon('date') }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-sm-down clickable" (click)="setSort('soll')"><ion-label><strong>{{ store.i18n.col_debit() }}{{ sortIcon('soll') }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-sm-down clickable" (click)="setSort('haben')"><ion-label><strong>{{ store.i18n.col_credit() }}{{ sortIcon('haben') }}</strong></ion-label></ion-col>
          <ion-col size="5" [sizeMd]="textSizeMd()" class="clickable" (click)="setSort('text')"><ion-label><strong>{{ store.i18n.col_name() }}{{ sortIcon('text') }}</strong></ion-label></ion-col>
          <ion-col size="4" size-md="2" class="ion-text-end clickable" (click)="setSort('amount')"><ion-label><strong>{{ store.i18n.col_amount() }}{{ sortIcon('amount') }}</strong></ion-label></ion-col>
          @if(store.saldoVisible()) {
            <ion-col size-md="2" class="ion-text-end ion-hide-sm-down"><ion-label><strong>{{ store.i18n.col_saldo() }}</strong></ion-label></ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <okr-read-only-banner [message]="store.i18n.read_only_banner()" />
    @if(isLoading()) {
      <okr-spinner />
    } @else if(filteredCount() === 0) {
      <okr-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(entry of visibleRows(); track entry.row.okey) {
          @if(entry.divider) {
            <ion-item-divider color="light"><ion-label>{{ entry.divider }}</ion-label></ion-item-divider>
          }
          @let row = entry.row;
          <ion-item button [detail]="false" (click)="showActions(row)" [class.for-review]="isForReview(row)"
            [class.selected]="isSelected(row)" [attr.data-booking]="row.booking.okey">
            <ion-grid>
              <ion-row>
                <ion-col size="3" size-md="2">
                  <!-- split bookings open to their parts; the others keep the chevron's room so the dates line up -->
                  @if(row.parts.length > 0) {
                    <ion-icon class="parts-toggle" src="{{ (isExpanded(row) ? 'chevron-down' : 'chevron-forward') | svgIcon }}"
                      (click)="toggleParts($event, row)" [attr.aria-label]="isExpanded(row) ? store.i18n.split_collapse() : store.i18n.split_expand()" />
                  } @else if(hasSplitRows()) {
                    <span class="parts-toggle-space"></span>
                  }
                  @if(isForReview(row)) {
                    <ion-icon class="review-icon" src="{{ 'alert-circle' | svgIcon }}" [attr.aria-label]="store.i18n.status_forReview()" />
                  }
                  {{ row.date }}
                </ion-col>
                <ion-col size-md="2" class="ion-hide-sm-down">
                  {{ row.debitAccount }}
                  @if (row.debitAccountName) { <br /><ion-note class="account-name">{{ row.debitAccountName }}</ion-note> }
                </ion-col>
                <ion-col size-md="2" class="ion-hide-sm-down">
                  {{ row.creditAccount }}
                  @if (row.creditAccountName) { <br /><ion-note class="account-name">{{ row.creditAccountName }}</ion-note> }
                </ion-col>
                <ion-col size="5" [sizeMd]="textSizeMd()">{{ row.accountName }}@if (row.counterparty) { · {{ row.counterparty }}}</ion-col>
                <ion-col size="4" size-md="2" class="ion-text-end">
                  {{ row.amount }}
                  <!-- no room for a sixth column on a phone: the saldo rides under the amount there -->
                  @if(store.saldoVisible()) { <br /><ion-note class="saldo ion-hide-md-up">{{ store.saldoOf(row) || '–' }}</ion-note> }
                </ion-col>
                @if(store.saldoVisible()) {
                  <ion-col size-md="2" class="ion-text-end ion-hide-sm-down">{{ store.saldoOf(row) || '–' }}</ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-item>
          <!-- the parts of an expanded split booking: Soll against Haben with the part's own text and amount -->
          @if(isExpanded(row)) {
            @for(part of row.parts; track part.okey) {
              <ion-item button [detail]="false" (click)="showActions(row)" class="part" [class.for-review]="isForReview(row)">
                <ion-grid>
                  <ion-row>
                    <ion-col size="3" size-md="2"></ion-col>
                    <ion-col size-md="2" class="ion-hide-sm-down">
                      {{ part.debitAccountId }}
                      @if(part.debitAccountName) { <br /><ion-note class="account-name">{{ part.debitAccountName }}</ion-note> }
                    </ion-col>
                    <ion-col size-md="2" class="ion-hide-sm-down">
                      {{ part.creditAccountId }}
                      @if(part.creditAccountName) { <br /><ion-note class="account-name">{{ part.creditAccountName }}</ion-note> }
                    </ion-col>
                    <ion-col size="5" [sizeMd]="textSizeMd()">
                      <!-- no Soll/Haben columns on a phone: the accounts lead the text there -->
                      <span class="ion-hide-md-up">{{ part.debitAccountId }} / {{ part.creditAccountId }}<br /></span>{{ part.text }}
                    </ion-col>
                    <ion-col size="4" size-md="2" class="ion-text-end">{{ part.amount }}</ion-col>
                  </ion-row>
                </ion-grid>
              </ion-item>
            }
          }
        }
      </ion-list>
    }
  </ion-content>
  `,
  styles: [`
    .clickable { cursor: pointer; user-select: none; }
    .account-badge {
      margin-left: 0.5rem; padding: 0.1rem 0.45rem;
      border-radius: 0.75rem; font-size: 0.7rem; font-weight: 600;
      background: var(--ion-color-light); color: var(--ion-color-light-contrast);
      vertical-align: middle;
    }
    .badge-clear { font-size: 0.9rem; vertical-align: middle; margin-left: 0.2rem; cursor: pointer; }
    .review-badge {
      margin-left: 0.5rem; padding: 0.1rem 0.45rem;
      border-radius: 0.75rem; font-size: 0.7rem; font-weight: 600;
      background: var(--ion-color-warning); color: var(--ion-color-warning-contrast);
      vertical-align: middle;
    }
    .review-icon { font-size: 1rem; vertical-align: text-bottom; color: var(--ion-color-warning-shade); }
    .account-name { font-size: 0.75rem; }
    .saldo { font-size: 0.75rem; font-weight: 600; }
    .parts-toggle { font-size: 1rem; vertical-align: text-bottom; margin: 0 0.2rem 0 -0.2rem; padding: 0.2rem; cursor: pointer; }
    .parts-toggle-space { display: inline-block; width: calc(1rem + 0.4rem); margin: 0 0.2rem 0 -0.2rem; }
    ion-item.part { font-size: 0.85rem; --min-height: 36px; color: var(--ion-color-medium-shade); }
    ion-item-divider { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    ion-item.for-review { --background: rgba(var(--ion-color-warning-rgb), 0.12); }
    ion-item.selected { --background: rgba(var(--ion-color-primary-rgb), 0.14); }
  `],
})
export class BookingList {
  protected readonly store = inject(BookingStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly contextMenuName = input.required<string>();
  // `?accountKey=<okey>` (query param, bound by withComponentInputBinding): show only bookings with a
  // line on that account — the account list navigates here from a leaf account in view mode.
  public readonly accountKey = input<string | undefined>();
  // `?year=<yyyy>&month=<1-12>` (query params): the period list navigates here to show one period's
  // bookings. `month` is omitted for an annual period.
  public readonly year = input<string | undefined>();
  public readonly month = input<string | undefined>();
  // `?bookingKey=<okey>` (query param): the ledger card of an invoice/bill view modal opens the
  // unfiltered journal (with `year`) here — the booking is selected and scrolled into view.
  public readonly bookingKey = input<string | undefined>();

  /** The booking last opened from here or linked to: highlighted until another row is tapped. */
  private readonly selectedKey = signal('');
  /** The linked booking still to scroll into view once its row is rendered (rows load after the route opens). */
  private pendingScrollKey = '';
  private readonly syncBookingKey = effect(() => {
    const key = this.bookingKey() ?? '';
    this.selectedKey.set(key);
    this.pendingScrollKey = key;
  });
  private readonly scrollToBooking = effect(() => {
    const rows = this.visibleRows();
    const key = untracked(() => this.pendingScrollKey);
    if (!key || !rows.some(entry => entry.row.booking.okey === key)) return;
    this.pendingScrollKey = '';
    requestAnimationFrame(() => this.host.nativeElement
      .querySelector(`ion-item[data-booking="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });

  private readonly syncAccountKey = effect(() => this.store.setAccountKey(this.accountKey() ?? ''));
  private readonly syncPeriod = effect(() => {
    const year = Number(this.year());
    if (Number.isInteger(year) && year > 0) this.store.setSelectedYear(year);
    const month = Number(this.month());
    this.store.setSelectedMonth(Number.isInteger(month) && month >= 1 && month <= 12 ? month : 0);
  });

  protected readonly popupId = computed(() => 'c_bookings');
  protected readonly isLoading = computed(() => this.store.isLoading());
  // sort state (default: newest first, as the store's journal order)
  private sortField = signal<JournalSortField>('date');
  private sortAsc   = signal(false);

  protected readonly filtered = computed(() => {
    const list = this.store.filteredRows();
    const field = this.sortField();
    const dir   = this.sortAsc() ? 1 : -1;
    return [...list].sort((a, b) => dir * (
      field === 'haben'  ? (a.creditAccount ?? '').localeCompare(b.creditAccount ?? '') :
      field === 'soll'   ? (a.debitAccount ?? '').localeCompare(b.debitAccount ?? '') :
      field === 'text'   ? (a.accountName ?? '').localeCompare(b.accountName ?? '') :
      field === 'amount' ? parseAmount(a.amount) - parseAmount(b.amount) :
                           ((a.booking.date ?? '').localeCompare(b.booking.date ?? '') || (a.booking.bookingNo ?? 0) - (b.booking.bookingNo ?? 0))
    ));
  });
  /**
   * The rows as rendered: with "Monatlich gruppieren" on, the first row of each month carries the
   * divider label. The month is read off the row itself, so the grouping follows whatever sort the
   * user picked — under the default date sort that is one divider per month.
   */
  protected readonly visibleRows = computed<{ row: JournalRow; divider: string }[]>(() => {
    const rows = this.filtered();
    if (!this.store.groupByMonth()) return rows.map(row => ({ row, divider: '' }));
    let previous = '';
    return rows.map(row => {
      const key = this.store.monthGroupOf(row.booking);
      const divider = key && key !== previous ? this.store.monthGroupLabelOf(key) : '';
      previous = key;
      return { row, divider };
    });
  });
  /** A running balance needs exactly one account: 'Saldo anzeigen' is offered only while the journal is filtered on one. */
  protected readonly excludedMenuItems = computed(() => this.store.accountKey() ? [] : ['journal-saldo']);
  /** The text column gives up half its width on md+ when the saldo column is shown. */
  protected readonly textSizeMd = computed(() => this.store.saldoVisible() ? '2' : '4');
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly count = computed(() => this.store.bookings().length);
  protected readonly years = computed(() => this.store.years());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => this.store.isReadOnly());
  protected readonly forReviewCount = computed(() => this.store.forReviewCount());
  protected readonly statusCategory = computed(() => this.store.statusCategory());

  /** Split bookings the user has opened to their lines (unfiltered journal only; keyed by row okey). */
  private readonly expandedRows = signal<ReadonlySet<string>>(new Set());

  /** Only when the visible list has a split booking do the rows make room for the chevron. */
  protected readonly hasSplitRows = computed(() => this.filtered().some(r => r.parts.length > 0));

  protected isExpanded(row: JournalRow): boolean {
    return row.parts.length > 0 && this.expandedRows().has(row.okey);
  }

  /** The chevron opens/closes the lines without opening the row's action sheet. */
  protected toggleParts(event: Event, row: JournalRow): void {
    event.stopPropagation();
    this.expandedRows.update(set => {
      const next = new Set(set);
      if (next.has(row.okey)) next.delete(row.okey); else next.add(row.okey);
      return next;
    });
  }

  protected isSelected(row: JournalRow): boolean {
    return !!this.selectedKey() && row.booking.okey === this.selectedKey();
  }

  protected isForReview(row: JournalRow): boolean {
    return isForReview(row.booking);
  }

  protected sortIcon(field: JournalSortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  protected setSort(field: JournalSortField): void {
    this.sortAsc.set(this.sortField() === field ? !this.sortAsc() : true);
    this.sortField.set(field);
  }

  /*-------------------------- popover context menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add':    await this.store.openCreate(); break;
      case 'export': await this.store.export(); break;
      case 'importBexio': await this.store.importBexioJournal(); break;
      case 'importBank': await this.store.importBankStatement(); break;
      case 'toggleSaldo': await this.store.toggleSaldo(); break;
      case 'toggleMonthGroups': this.store.toggleMonthGroups(); break;
      default: error(undefined, `BookingList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /*-------------------------- per-item action sheet --------------------------------*/
  protected async showActions(row: JournalRow): Promise<void> {
    const booking = row.booking;
    this.selectedKey.set(booking.okey);
    const lines = this.store.linesByBooking().get(booking.okey) ?? [];
    const actions = this.store.availableActions(booking);
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, actions, booking);
    await this.executeActions(options, booking, lines, actions);
  }

  private addActionSheetButtons(options: ActionSheetOptions, actions: BookingAction[], booking: BookingModel): void {
    // Where the money went: the two accounts, the counterparty and the invoice/bill, before anything that changes the booking.
    options.buttons.push(createActionSheetButton('booking.showCredit', this.store.i18n.as_show_credit(), this.imgixBaseUrl, 'eye-on'));
    options.buttons.push(createActionSheetButton('booking.showDebit', this.store.i18n.as_show_debit(), this.imgixBaseUrl, 'eye-on'));
    if (booking.counterparty?.key) {
      options.buttons.push(createActionSheetButton('booking.showCounterparty', this.store.i18n.as_show_counterparty(), this.imgixBaseUrl, 'person'));
    }
    const doc = this.store.documentOf(booking);
    if (doc) {
      const label = doc.kind === 'invoice' ? this.store.i18n.as_show_invoice() : this.store.i18n.as_show_bill();
      options.buttons.push(createActionSheetButton('booking.showDocument', label, this.imgixBaseUrl, 'invoice'));
    }
    options.buttons.push(createActionSheetDivider());
    // Treasurer decision on an OCR-proposed booking comes first — it is why the row was opened.
    // A locked period takes no ledger change (the CFs refuse it); rejecting only cancels the proposal.
    const isLocked = this.store.isLocked(booking);
    if (this.store.canReview(booking)) {
      if (!isLocked) {
        options.buttons.push(createActionSheetButton('booking.approve', this.store.i18n.review_approve(), this.imgixBaseUrl, 'checkbox-circle'));
        options.buttons.push(createActionSheetButton('booking.review',  this.store.i18n.review_correct(), this.imgixBaseUrl, 'edit'));
      }
      options.buttons.push(createActionSheetButton('booking.reject',  this.store.i18n.review_reject(),  this.imgixBaseUrl, 'cancel-circle'));
      options.buttons.push(createActionSheetDivider());
    }
    if (this.readOnly()) {
      options.buttons.push(createActionSheetButton('booking.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    } else if (isLocked) {
      options.buttons.push(createActionSheetButton('booking.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
      options.buttons.push(createActionSheetButton('booking.copy', this.store.i18n.copy(), this.imgixBaseUrl, 'copy'));
    } else {
      options.buttons.push(createActionSheetButton('booking.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('booking.copy', this.store.i18n.copy(), this.imgixBaseUrl, 'copy'));
      if (this.hasRole('admin')) {
        options.buttons.push(createActionSheetButton('booking.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
      }
    }
    if (actions.length > 0) {
      options.buttons.push(createActionSheetDivider());
      actions.forEach((_, i) => {
        options.buttons.push(createActionSheetButton(`booking.receipt.${i}`, this.store.i18n.action_createReceipt(), this.imgixBaseUrl, 'document'));
      });
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, booking: BookingModel, lines: BookingLineModel[], actions: BookingAction[]): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    const action: string = data.action;
    if (action === 'booking.showCredit') { await this.showSideAccount(lines, 'credit'); return; }
    if (action === 'booking.showDebit') { await this.showSideAccount(lines, 'debit'); return; }
    if (action === 'booking.showCounterparty') { await this.store.showCounterparty(booking); return; }
    if (action === 'booking.showDocument') { await this.store.showDocument(booking); return; }
    if (action === 'booking.approve') { await this.store.approve(booking); return; }
    if (action === 'booking.review')  { await this.store.openReview(booking, lines); return; }
    if (action === 'booking.reject')  { await this.store.reject(booking); return; }
    if (action === 'booking.view')   { await this.store.openEdit(booking, lines, true); return; }
    if (action === 'booking.edit')   { await this.store.openEdit(booking, lines, this.readOnly()); return; }
    if (action === 'booking.copy')   { await this.store.openCopy(booking, lines); return; }
    if (action === 'booking.delete') { await this.store.delete(booking); return; }
    if (action.startsWith('booking.receipt.')) {
      const idx = Number(action.substring('booking.receipt.'.length));
      const bookingAction = actions[idx];
      if (bookingAction) await this.store.runAction(bookingAction, booking);
    }
  }

  /**
   * "Soll-/Haben-Konto anzeigen": one account on that side opens it directly; the parts' side of a
   * split booking has several, so a sheet asks which one.
   */
  private async showSideAccount(lines: BookingLineModel[], side: 'debit' | 'credit'): Promise<void> {
    const keys = sideAccountKeys(lines, side);
    if (keys.length <= 1) { await this.store.showAccount(keys[0] ?? ''); return; }
    const options = createActionSheetOptions(this.store.i18n.as_select_account());
    for (const key of keys) {
      const label = `${this.store.accountIdByKey().get(key) ?? ''} ${this.store.accountNameByKey().get(key) ?? ''}`.trim();
      options.buttons.push(createActionSheetButton(`account.${key}`, label || key, this.imgixBaseUrl, 'eye-on'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    const action: string = data?.action ?? '';
    if (action.startsWith('account.')) await this.store.showAccount(action.substring('account.'.length));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
