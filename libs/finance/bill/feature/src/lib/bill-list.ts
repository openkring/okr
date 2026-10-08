import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, untracked, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BillModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, formatMinorAmount, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, generateRandomString, getTodayStr, getYear, getYearList, hasRole } from '@okr/shared-util-core';
import { billDisplayState, billStateColor, billStateLabel, billVoucherKeys, isDraftBill, isOverdueBill, isPayableBill } from '@okr/finance-bill-util';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { BillStore } from './bill.store';

@Component({
  selector: 'okr-bill-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BillStore],
  imports: [
    SvgIconPipe, AvatarPipe,
    Spinner, ListFilter, EmptyList, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonAvatar, IonImg, IonChip
  ],
  styles: [`
    .attach-icon { font-size: 0.9rem; vertical-align: middle; margin-left: 4px; color: var(--ion-color-medium); }
    .bill-id { font-size: 0.8rem; }
    .bill-title { font-size: 1rem; }
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
        @if(canChange()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
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
      } @else if(filteredBills().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-grid>
          @for(bill of filteredBills(); track bill.okey) {
            <ion-row [class.overdue]="isOverdue(bill) && !hasHint(bill)" (click)="showActions(bill)">
              <ion-col size="2" class="ion-align-self-center">{{ formatDate(bill.billDate) }}</ion-col>
              <ion-col size="1">
                @if(bill.vendor; as v) {
                  <ion-avatar>
                    <ion-img src="{{ v.modelType + '.' + v.key | avatar:v.modelType }}" alt="Vendor Logo" />
                  </ion-avatar>
                }
              </ion-col>
              <ion-col>
                <ion-label>
                  <span class="bill-id">{{ bill.billId }}</span>
                  @if(hasVoucher(bill)) { <ion-icon class="attach-icon" src="{{ 'attachment' | svgIcon }}" aria-hidden="true" /> }
                  <p class="bill-title">{{ bill.title }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center ion-text-end">{{ getAmount(bill.totalAmount?.amount) }}</ion-col>
              <ion-col size="2" class="state">
                @if(hasHint(bill)) {
                  <!-- a booking that probably paid this bill exists (spec 1.85 Q4) -->
                  <ion-chip [outline]="true" size="small" color="warning">{{ store.i18n.payment_hint() }}</ion-chip>
                } @else {
                  <ion-chip [outline]="true" size="small" [color]="getStateColor(displayState(bill))">
                    {{ getStateLabel(displayState(bill)) }}
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
export class BillList {
  protected readonly store = inject(BillStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  // inputs
  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();
  // `?billKey=<okey>` (query param): the journal's "Lieferanten-Rechnung anzeigen" opens that bill's view modal here
  public readonly billKey = input<string | undefined>();
  private openedKey = '';

  // computed
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredBills = computed(() => this.store.filteredBills());
  protected readonly filteredCount = computed(() => this.filteredBills().length);
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);
  // Unique per instance: Ionic keeps the previous page in the DOM, so a fixed id (same for scs and gss books)
  // binds the popover of the next page to the hidden button of the previous one.
  protected readonly popupId = signal(`c_bills_${generateRandomString(8)}`);
  private readonly today = getTodayStr();
  protected years = computed(() => getYearList(getYear(), 8));
  protected states = computed(() => this.store.states());

  constructor() {
    effect(() => {
      const listId = this.listId();
      if (listId) this.store.setListId(listId);
    });
    // once the list is loaded; only once per key, so closing the modal does not reopen it
    effect(() => {
      const key = this.billKey() ?? '';
      if (!key || key === this.openedKey) return;
      const bill = (this.store.allBillsResource.value() ?? []).find(d => d.okey === key);
      if (!bill) return;
      this.openedKey = key;
      void untracked(() => this.store.view(bill));
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
  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  protected getAmount(cents?: number): string {
    if (cents === undefined) return '';
    return formatMinorAmount(cents);
  }

  /** overdue = to pay and past its due date (or marked overdue by bexio) */
  protected isOverdue(bill: BillModel): boolean {
    return isOverdueBill(bill, this.today);
  }

  /** a booking that probably paid this open bill exists (spec 1.85 Q4) */
  /** at least one Beleg (finance-document) */
  protected hasVoucher(bill: BillModel): boolean {
    return billVoucherKeys(bill).length > 0;
  }

  protected hasHint(bill: BillModel): boolean {
    return this.store.paymentHints().has(bill.okey);
  }

  protected displayState(bill: BillModel): string {
    return billDisplayState(bill, this.today);
  }

  protected getStateColor(state: string): string {
    return billStateColor(state);
  }

  protected getStateLabel(state: string): string {
    return billStateLabel(state, this.store.i18n);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      case 'scan': await this.store.scan(); break;
      case 'upload': await this.store.upload(); break;
      case 'exportRaw': await this.store.export('raw', this.filteredBills()); break;
      // Offene Posten (spec 1.86): the reconciliation of these books
      case 'openItems': await this.router.navigate(['/accounting', this.store.accountingStore.accountingTenantId(), 'open-items']); break;
      default: error(undefined, `BillList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  protected async showActions(bill: BillModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    const base = this.imgixBaseUrl();
    options.buttons.push(createActionSheetButton('bill.view', this.store.i18n.view(), base, 'eye-on'));
    if (bill.attachments.length > 0) {
      options.buttons.push(createActionSheetButton('bill.download', this.store.i18n.download(), base, 'download'));
    }
    // native books, treasurer only (the bill callables check the same): a draft is edited, booked or
    // deleted; an open bill takes a payment (spec 1.85)
    if (!this.store.isExternallyManaged() && hasRole('treasurer', this.currentUser())) {
      if (isDraftBill(bill)) {
        options.buttons.push(createActionSheetButton('bill.edit', this.store.i18n.update(), base, 'edit'));
        options.buttons.push(createActionSheetButton('bill.book', this.store.i18n.book(), base, 'checkmark'));
        options.buttons.push(createActionSheetButton('bill.delete', this.store.i18n.delete(), base, 'trash'));
      }
      // booked and paid bills: texts, notes, payment data, Kostenstelle and Kostenträger (spec 1.92)
      if (!isDraftBill(bill)) {
        options.buttons.push(createActionSheetButton('bill.details', this.store.i18n.details_update(), base, 'edit'));
      }
      if (isPayableBill(bill)) {
        options.buttons.push(createActionSheetButton('bill.payment', this.store.i18n.payment(), base, 'chf'));
      }
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bill.view': await this.store.view(bill); break;
      case 'bill.download': await this.store.showPdf(bill); break;
      case 'bill.payment': await this.store.recordPayment(bill, this.store.paymentHints().get(bill.okey)); break;
      case 'bill.details': await this.store.editDetails(bill); break;
      case 'bill.edit': await this.store.edit(bill); break;
      case 'bill.book': await this.store.book(bill); break;
      case 'bill.delete': await this.store.delete(bill); break;
    }
    this.cdr.markForCheck();
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected canChange(): boolean {
    return hasRole('treasurer', this.currentUser()) || hasRole('privileged', this.currentUser());
  }
}
