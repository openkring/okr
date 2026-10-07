import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular/standalone';

import { AvatarPipe } from '@okr/avatar-ui';
import { AvatarDetailService, FinanceHistory, LedgerBookings, VoucherTiles } from '@okr/finance-accounting-feature';
import { billAccountKeys, billBookingAmounts, billBookingKeys, billDisplayState, billStateColor, billStateLabel, billVoucherKeys, isOverdueBill, isPayableBill } from '@okr/finance-bill-util';
import { BillModel, BillPayment } from '@okr/shared-models';
import { formatMinorAmount, Header } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { convertDateFormatToString, DateFormat, fill, getFullName, getTodayStr, hasRole } from '@okr/shared-util-core';
import { BillStore } from './bill.store';


@Component({
  selector: 'okr-bill-view-modal',
  standalone: true,
  providers: [BillStore],
  imports: [
    VoucherTiles, LedgerBookings, FinanceHistory,
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Header,
    IonContent, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonChip, IonAvatar, IonImg, IonButton, IonNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .view-label { font-size: 0.8rem; }
    .overdue { color: var(--ion-color-danger); }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.bills() }" [isModal]="true" />
    <ion-content class="ion-no-padding">
      @if(bill(); as bill) {
        <ion-card>
          <ion-card-content>
            <!-- billId -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'info-circle' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.id() }}</p>
                <p class="view-value">{{ billId() }}</p>
              </ion-label>
            </ion-item>
            <!-- vendor (counterparty) -->
            @if(bill.vendor; as vendor) {
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <ion-img src="{{ vendor.modelType + '.' + vendor.key | avatar:vendor.modelType }}" alt="Vendor Logo" />
                </ion-avatar>
                <ion-label>
                  <p class="view-label">{{ store.i18n.vendor() }}</p>
                  <p class="view-value">{{ vendorName() }}</p>
                </ion-label>
                <ion-button slot="end" fill="clear" [title]="store.i18n.vendor()" (click)="showVendor()">
                  <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
                </ion-button>
              </ion-item>
            }
            <!-- title -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'edit' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.title() }}</p>
                <p class="view-value">{{ title() }}</p>
              </ion-label>
            </ion-item>
            <!-- billDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.bill_date() }}</p>
                <p class="view-value">{{ billDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- dueDate -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.due_date() }}</p>
                <p class="view-value" [class.overdue]="isOverdue()">{{ dueDate() | prettyDate }}</p>
              </ion-label>
            </ion-item>
            <!-- amount -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.amount() }}</p>
                <p class="view-value" [class.overdue]="isOverdue()">{{ amount() }}</p>
              </ion-label>
            </ion-item>
            <!-- state -->
            <ion-item lines="none">
              <ion-icon slot="start" src="{{'target' | svgIcon}}" />
              <ion-label>
                <p class="view-label">{{ store.i18n.state() }}</p>
                <ion-chip [outline]="true" size="small" [color]="stateColor()">
                  {{ stateLabel() }}
                </ion-chip>
              </ion-label>
            </ion-item>
            <!-- paymentDate -->
            @if(paymentDate().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'calendar-number' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.payment_date() }}</p>
                  <p class="view-value">{{ paymentDate() | prettyDate }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- notes -->
            @if(notes().length > 0) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{'chatbox' | svgIcon}}" />
                <ion-label>
                  <p class="view-label">{{ store.i18n.notes() }}</p>
                  <p class="view-value">{{ notes() }}</p>
                </ion-label>
              </ion-item>
            }
            <!-- a booking that probably paid this bill (spec 1.85 Q4) -->
            @if(hint(); as hint) {
              <ion-item lines="none" color="warning">
                <ion-icon slot="start" src="{{'link' | svgIcon}}" />
                <ion-label class="ion-text-wrap">{{ hintText() }}</ion-label>
                @if(canPay()) {
                  <ion-button slot="end" fill="outline" (click)="recordPayment(true)">{{ store.i18n.payment_hint_link() }}</ion-button>
                }
              </ion-item>
            }
            @if(canPay()) {
              <ion-button expand="block" fill="outline" (click)="recordPayment(false)">
                <ion-icon slot="start" src="{{'chf' | svgIcon}}" />
                {{ store.i18n.payment() }}
              </ion-button>
            }
          </ion-card-content>
        </ion-card>
        <!-- payments (spec 1.85): a linked one can be unlinked, a posted one is undone by deleting its booking -->
        @if(payments().length > 0) {
          <ion-card>
            <ion-card-header><ion-card-title>{{ store.i18n.payments_title() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              @for(payment of payments(); track $index) {
                <ion-item lines="none">
                  <ion-label>{{ payment.date | prettyDate }}</ion-label>
                  <ion-note slot="end">CHF {{ formatAmount(payment.amount) }}</ion-note>
                  @if(canUnlink(payment)) {
                    <ion-button slot="end" fill="clear" [title]="store.i18n.unlink()" (click)="unlink(payment)">
                      <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-card-content>
          </ion-card>
        }
        <!-- the linked bookings (bill + payments) as journal rows, each linked to its booking in the journal; an unlinked bill: its booking accounts -->
        <okr-ledger-bookings [accountingTenantId]="bill.accountingTenantId" [bookingKeys]="bookingKeys()"
          [bookingAmounts]="bookingAmounts()" [accountKeys]="accountKeys()" [date]="bill.billDate" />
      }
      <!-- attachments migrated from bexio: finance-documents okeys, files in the private bucket (spec 1.74) -->
      <okr-voucher-tiles [documentKeys]="voucherKeys()" />
      <!-- Verlauf: events written by the Cloud Functions and the treasurer's notes -->
      @if (mayReadHistory() && bill().okey) {
        <okr-finance-history [parentKey]="'bill.' + bill().okey" />
      }
    </ion-content>
  `
})
export class BillViewModal {
  protected readonly store = inject(BillStore);
  private readonly avatarDetailService = inject(AvatarDetailService);
  private readonly modalController = inject(ModalController);

  public readonly bill = input.required<BillModel>();

  protected readonly billId = computed(() => this.bill()?.billId ?? '');
  protected readonly title = computed(() => this.bill()?.title ?? '');
  protected readonly billDate = computed(() => this.bill()?.billDate ?? '');
  protected readonly dueDate = computed(() => this.bill()?.dueDate ?? '');
  protected readonly amount = computed(() => formatMinorAmount(this.bill()?.totalAmount?.amount ?? 0));
  private readonly today = getTodayStr();
  protected readonly isOverdue = computed(() => isOverdueBill(this.bill(), this.today));
  protected readonly state = computed(() => billDisplayState(this.bill(), this.today));
  protected readonly stateColor = computed(() => billStateColor(this.state()));
  protected readonly stateLabel = computed(() => billStateLabel(this.state(), this.store.i18n));
  protected readonly accountKeys = computed(() => billAccountKeys(this.bill()));
  protected readonly bookingKeys = computed(() => billBookingKeys(this.bill()));
  protected readonly bookingAmounts = computed(() => billBookingAmounts(this.bill()));
  protected readonly vendorName = computed(() => {
    const vendor = this.bill()?.vendor;
    return vendor ? vendor.label || getFullName(vendor.name1, vendor.name2) : '';
  });
  protected readonly paymentDate = computed(() => this.bill()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.bill()?.notes ?? '');
  // legacy bills still hold bexio file UUIDs — only migrated keys are vouchers
  protected readonly voucherKeys = computed(() => billVoucherKeys(this.bill()));

  // payments (spec 1.85)
  protected readonly payments = computed(() => this.bill()?.payments ?? []);
  private readonly isTreasurer = computed(() => hasRole('treasurer', this.store.appStore.currentUser()));
  /** the Verlauf (finance-comments) is treasurer/privileged only, like the vouchers */
  protected readonly mayReadHistory = computed(() => this.isTreasurer() || hasRole('privileged', this.store.appStore.currentUser()));
  protected readonly canPay = computed(() => this.isTreasurer() && !this.store.isExternallyManaged() && isPayableBill(this.bill()));
  protected readonly hint = computed(() => this.store.paymentHints().get(this.bill()?.okey ?? ''));
  protected readonly hintText = computed(() => {
    const c = this.hint();
    if (!c) return '';
    const date = convertDateFormatToString(c.date, DateFormat.StoreDate, DateFormat.ViewDate, false) || c.date;
    const no = c.bookingNo > 0 ? `#${c.bookingNo} · ` : '';
    return fill(this.store.i18n.payment_hint_text(), { booking: `${date} · ${no}${c.title} · CHF ${formatMinorAmount(c.debitedAmount)}` });
  });

  protected formatAmount(rappen: number): string {
    return formatMinorAmount(rappen ?? 0);
  }

  /** a linked payment of a native book; one okr posted itself (`bill-{key}-pay-…`) is undone in the journal */
  protected canUnlink(payment: BillPayment): boolean {
    const key = payment.bookingKey ?? '';
    return this.isTreasurer() && !this.store.isExternallyManaged() && key.length > 0 && !key.startsWith(`bill-${this.bill()?.okey}-pay-`);
  }

  /** Opens the payment dialog (with the hinted booking when `useHint`); a recorded payment closes the view — the list shows the new state. */
  protected async recordPayment(useHint: boolean): Promise<void> {
    const recorded = await this.store.recordPayment(this.bill(), useHint ? this.hint() : undefined);
    if (recorded) await this.modalController.dismiss(null, 'confirm');
  }

  protected async unlink(payment: BillPayment): Promise<void> {
    const unlinked = await this.store.unlinkPayment(this.bill(), payment.bookingKey ?? '');
    if (unlinked) await this.modalController.dismiss(null, 'confirm');
  }

  protected async showVendor(): Promise<void> {
    await this.avatarDetailService.show(this.bill()?.vendor);
  }
}
