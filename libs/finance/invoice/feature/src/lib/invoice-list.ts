import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg,
  IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar, PopoverController,
} from '@ionic/angular/standalone';
import { InvoiceModel, RoleName } from '@okr/shared-models';
import {
  canCreatePaymentConfirmation, canCreateReminder, canEmailInvoice, hasInvoiceVoucher, invoiceDisplayState, invoiceStateColor, invoiceStateLabel, isDraftInvoice, isOverdueInvoice, isPayableState, isWaivedReminder, latestReminderWithDocument, mayReadInvoiceDocuments, waivableReminder,
} from '@okr/finance-invoice-util';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, formatMinorAmount, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getTodayStr, getYear, getYearList, hasRole } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { InvoiceStore } from './invoice.store';

@Component({
  selector: 'okr-invoice-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InvoiceStore],
  imports: [
    SvgIconPipe, AvatarPipe,
    Spinner, ListFilter, EmptyList, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonAvatar, IonImg, IonChip, IonList, IonItem
  ],
  styles: [`
    .attach-icon { font-size: 0.9rem; vertical-align: middle; margin-left: 4px; color: var(--ion-color-medium); }
    .inv-id { font-size: 0.8rem; }
    .inv-title { font-size: 1rem; }
    .amount { text-align: right; }
    .state { text-align: right; }
    .overdue { color: var(--ion-color-danger); }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
    ion-avatar { height: 30px; width: 30px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }} {{ store.i18n.list_title() }}</ion-title>
        @if(canWriteDrafts()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                  <!-- not a menuItems row: it is offered only while the list holds drafts -->
                  @if (canIssueAllDrafts() || canRunMahnlauf()) {
                    <ion-list lines="none">
                      @if (canIssueAllDrafts()) {
                        <ion-item button="true" detail="false" (click)="selectPopoverAction('issueAllDrafts')">
                          <ion-icon slot="start" src="{{ 'send' | svgIcon }}" />
                          <ion-label>{{ store.i18n.issue_all() }}</ion-label>
                        </ion-item>
                      }
                      <!-- likewise not a menuItems row: offered only while invoices of the list are due for a reminder -->
                      @if (canRunMahnlauf()) {
                        <ion-item button="true" detail="false" (click)="selectPopoverAction('mahnlauf')">
                          <ion-icon slot="start" src="{{ 'alarm' | svgIcon }}" />
                          <ion-label>{{ store.i18n.mahnlauf() }}</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  }
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <okr-list-filter
        (searchTermChanged)="onSearchTermChange($event)"
        (stateChanged)="onStateSelected($event)" [states]="states()"
        (yearChanged)="onYearSelected($event)" [years]="years()"
      />
    </ion-header>

    <ion-content>
      <okr-read-only-banner [message]="store.i18n.read_only_banner()" />
      @if(isLoading()) {
        <okr-spinner />
      } @else if(filteredInvoices().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(invoice of filteredInvoices(); track invoice.okey) {
            <ion-row [class.overdue]="isOverdue(invoice) && !hasHint(invoice)" (click)="showActions(invoice)">
              <ion-col size="2" class="ion-align-self-center">{{ formatDate(invoice.invoiceDate) }}</ion-col>
              <ion-col size="1">
                @if(invoice.receiver; as r) {
                  <ion-avatar>
                    <ion-img src="{{ r.modelType + '.' + r.key | avatar:r.modelType }}" alt="Receiver Logo" />
                  </ion-avatar>
                }
              </ion-col>
              <ion-col>
                <ion-label>
                  <span class="inv-id">{{ invoice.invoiceId }}</span>
                  @if(hasVoucher(invoice)) { <ion-icon class="attach-icon" src="{{ 'attach' | svgIcon }}" aria-hidden="true" /> }
                  <p class="inv-title">{{ invoice.title }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center ion-text-end">{{ getAmount(invoice.totalAmount?.amount) }}</ion-col>
              <ion-col size="2" class="state">
                @if(hasHint(invoice)) {
                  <!-- a booking that probably paid this invoice exists (spec 1.86) -->
                  <ion-chip [outline]="true" size="small" color="warning">{{ store.i18n.payment_hint() }}</ion-chip>
                } @else {
                  <ion-chip [outline]="true" size="small" [color]="getStateColor(displayState(invoice))">
                    {{ getStateLabel(displayState(invoice)) }}
                  </ion-chip>
                }
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      }
    </ion-content>
  `
})
export class InvoiceList {
  protected readonly store = inject(InvoiceStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly popoverController = inject(PopoverController);

  // inputs
  public readonly listId = input.required<string>();  // all, my, personKey
  public readonly contextMenuName = input.required<string>();
  // `?invoiceKey=<okey>` (query param): the journal's "Rechnung anzeigen" opens that invoice's view modal here
  public readonly invoiceKey = input<string | undefined>();
  private openedKey = '';

  // computed
  protected readonly popupId = computed(() => `c_invoices_${this.listId()}`);
  private readonly today = getTodayStr();
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredInvoices = computed(() => this.store.filteredInvoices());
  protected readonly filteredCount = computed(() => this.filteredInvoices().length);
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);
  protected years = computed(() => getYearList(getYear(), 8));
  protected states = computed(() => this.store.states());
  /** "Alle Entwürfe ausstellen": treasurer, native books, and only while the list holds drafts */
  protected readonly canIssueAllDrafts = computed(() =>
    this.store.isExternallyManaged() === false && hasRole('treasurer', this.currentUser()) && this.store.draftsToIssue().length > 0);
  /** "Mahnlauf": treasurer, native books, and only while invoices of the list are due for a reminder */
  protected readonly canRunMahnlauf = computed(() =>
    this.store.isExternallyManaged() === false && hasRole('treasurer', this.currentUser()) && this.store.mahnlaufInvoices().length > 0);

  /******************************** constructor ******************************************* */
  constructor() {
    effect(() => {
      const listId = this.listId();
      if (listId) this.store.setListId(listId);
    });
    // once the list is loaded; only once per key, so closing the modal does not reopen it
    effect(() => {
      const key = this.invoiceKey() ?? '';
      if (!key || key === this.openedKey) return;
      const invoice = (this.store.allInvoicesResource.value() ?? []).find(d => d.okey === key);
      if (!invoice) return;
      this.openedKey = key;
      void untracked(() => this.store.view(invoice));
    });
  }

  /******************************** setters (filter) ******************************************* */
  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onStateSelected(state: string): void {
    this.store.setSelectedState(state);
  }

  protected onYearSelected(year: number): void {
    this.store.setSelectedYear(year);
  }

  /******************************** getters ******************************************* */

  protected getAmount(cents?: number): string {
    if (cents === undefined) return '';
    return formatMinorAmount(cents);
  }

  /** overdue = open and past its due date; computed, the stored state stays `pending` */
  protected isOverdue(invoice: InvoiceModel): boolean {
    return isOverdueInvoice(invoice, this.today);
  }

  /** a booking that probably paid this open invoice exists (spec 1.86) */
  /** at least one Beleg: the issued PDF or a reminder PDF */
  protected hasVoucher(invoice: InvoiceModel): boolean {
    return hasInvoiceVoucher(invoice);
  }

  protected hasHint(invoice: InvoiceModel): boolean {
    return this.store.paymentHints().has(invoice.okey);
  }

  protected displayState(invoice: InvoiceModel): string {
    return invoiceDisplayState(invoice, this.today);
  }

  protected getStateColor(state: string): string {
    return invoiceStateColor(state);
  }

  protected getStateLabel(state: string): string {
    return invoiceStateLabel(state, this.store.i18n);
  }

  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  /******************************* actions *************************************** */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      case 'exportRaw': await this.store.export('raw', this.filteredInvoices()); break;
      // Offene Posten (spec 1.86): the reconciliation of these books
      case 'openItems': await this.router.navigate(['/accounting', this.store.accountingStore.accountingTenantId(), 'open-items']); break;
      case 'issueAllDrafts': await this.store.issueAllDrafts(); break;
      case 'mahnlauf': await this.store.runMahnlauf(); break;
      default: error(undefined, `InvoiceList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  protected async selectPopoverAction(action: string): Promise<void> {
    await this.popoverController.dismiss(action);
  }

  protected async showActions(invoice: InvoiceModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    await this.addActionSheetButtons(options, invoice);
    await this.executeActions(options, invoice);
  }

  /**
   * A native draft is edited, issued or deleted; `issuing` (a transient server state) only shows its
   * details. An open invoice (`pending`, or the migrated `partial` / `unpaid`) takes a payment, a
   * `pending` one can also be cancelled — those write actions are for the treasurer. The treasurer also
   * creates the next reminder of an open invoice, mails the invoice PDF or the latest reminder PDF, and
   * opens the latest reminder PDF (spec 1.76 phase 3); the latest reminder is not mailed once its fee
   * is waived. The treasurer can also waive the fee of the latest waivable reminder (*Gebühr erlassen*, D18). A paid invoice
   * offers its payment confirmation to whoever may read its documents (treasurer, privileged, or its
   * receiver). Every issued invoice shows its PDF.
   * Books kept in bexio are read-only here: details, PDF and the payment confirmation.
   */
  private async addActionSheetButtons(options: ActionSheetOptions, invoice: InvoiceModel): Promise<void> {
    const base = this.imgixBaseUrl();
    const i18n = this.store.i18n;
    if (this.store.isExternallyManaged() !== false) {
      options.buttons.push(createActionSheetButton('invoice.view', i18n.view(), base, 'eye-on'));
      options.buttons.push(createActionSheetButton('invoice.showpdf', i18n.show_pdf(), base, 'download'));
    } else if (isDraftInvoice(invoice)) {
      if (this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.edit', i18n.update(), base, 'edit'));
        options.buttons.push(createActionSheetButton('invoice.preview', i18n.show_preview(), base, 'eye-on'));
        options.buttons.push(createActionSheetButton('invoice.issue', i18n.issue(), base, 'send'));
        options.buttons.push(createActionSheetButton('invoice.delete', i18n.delete(), base, 'trash'));
      } else {
        options.buttons.push(createActionSheetButton('invoice.view', i18n.view(), base, 'eye-on'));
      }
    } else if (invoice.state === 'issuing') {
      // an interrupted issue: issueInvoice resumes it with the number it already has
      if (this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.issue', i18n.issue(), base, 'send'));
      }
      options.buttons.push(createActionSheetButton('invoice.view', i18n.view(), base, 'eye-on'));
    } else {
      if (isPayableState(invoice.state) && this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.payment', i18n.payment(), base, 'chf'));
      }
      if (canCreateReminder(invoice) && this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.createReminder', i18n.reminder_create(), base, 'alarm'));
      }
      if (waivableReminder(invoice) && this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.waiveFee', i18n.waive_fee(), base, 'cancel-circle'));
      }
      if (canEmailInvoice(invoice) && this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.sendEmail', i18n.email_send(), base, 'email'));
      }
      if (canEmailInvoice(invoice) && this.canWriteDrafts()) {
        // printed and mailed by hand: there is no other way to tell the system
        options.buttons.push(createActionSheetButton('invoice.markPost', i18n.email_post(), base, 'mail'));
      }
      if (latestReminderWithDocument(invoice.reminders) && this.canWriteDrafts()) {
        // a paid or cancelled invoice gets no reminder mail; its reminder PDF can still be opened
        // a reminder whose fee was waived is not mailed: its PDF still shows the fee
        if (isPayableState(invoice.state) && !isWaivedReminder(latestReminderWithDocument(invoice.reminders))) {
          options.buttons.push(createActionSheetButton('invoice.sendReminder', i18n.reminder_send(), base, 'mail'));
        }
        options.buttons.push(createActionSheetButton('invoice.showReminder', i18n.reminder_show(), base, 'download'));
      }
      if (invoice.state === 'pending' && this.canWriteDrafts()) {
        options.buttons.push(createActionSheetButton('invoice.cancelInvoice', i18n.cancel_invoice(), base, 'cancel-circle'));
      }
      if (canCreatePaymentConfirmation(invoice) && mayReadInvoiceDocuments(invoice, this.currentUser() ?? undefined)) {
        options.buttons.push(createActionSheetButton('invoice.paymentConfirmation', i18n.payment_confirmation(), base, 'document'));
      }
      options.buttons.push(createActionSheetButton('invoice.showpdf', i18n.show_pdf(), base, 'download'));
      options.buttons.push(createActionSheetButton('invoice.view', i18n.view(), base, 'eye-on'));
    }
    if (this.store.isExternallyManaged() !== false && canCreatePaymentConfirmation(invoice)) {
      options.buttons.push(createActionSheetButton('invoice.paymentConfirmation', i18n.payment_confirmation(), base, 'document'));
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), base, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];
  }

  private async executeActions(options: ActionSheetOptions, invoice: InvoiceModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'invoice.view': await this.store.view(invoice); break;
      case 'invoice.showpdf': await this.store.showPdf(invoice); break;
      case 'invoice.paymentConfirmation': await this.store.createPaymentConfirmation(invoice); break;
      case 'invoice.edit': await this.store.edit(invoice, false); break;
      case 'invoice.issue': await this.store.issue(invoice); break;
      case 'invoice.delete': await this.store.delete(invoice); break;
      case 'invoice.payment': await this.store.recordPayment(invoice, this.store.paymentHints().get(invoice.okey)); break;
      case 'invoice.cancelInvoice': await this.store.cancelInvoice(invoice); break;
      case 'invoice.waiveFee': await this.store.waiveReminderFee(invoice); break;
      case 'invoice.createReminder': await this.store.createReminder(invoice); break;
      case 'invoice.sendEmail': await this.store.sendInvoiceEmail(invoice); break;
      case 'invoice.preview': await this.store.preview(invoice); break;
      case 'invoice.markPost': await this.store.markSentByPost(invoice); break;
      case 'invoice.sendReminder': await this.store.sendReminderEmail(invoice); break;
      case 'invoice.showReminder': await this.store.showReminderPdf(invoice); break;
    }
    this.cdr.markForCheck();
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /** writeInvoice and issueInvoice accept treasurer (and admin) only — not privileged */
  protected canWriteDrafts(): boolean {
    return hasRole('treasurer', this.currentUser());
  }

}
