import { Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonChip, IonContent, IonIcon, IonImg, IonItem, IonLabel } from '@ionic/angular/standalone';

import { AvatarPipe } from '@okr/avatar-ui';
import { AvatarDetailService, LedgerBookings, VoucherTiles } from '@okr/finance-accounting-feature';
import { billAccountKeys, billBookingKeys, billDisplayState, billStateColor, billStateLabel, isOverdueBill } from '@okr/finance-bill-util';
import { BillModel } from '@okr/shared-models';
import { formatMinorAmount, Header } from '@okr/shared-ui';
import { PrettyDatePipe, SvgIconPipe } from '@okr/shared-pipes';
import { getFullName, getTodayStr } from '@okr/shared-util-core';
import { BillStore } from './bill.store';


@Component({
  selector: 'okr-bill-view-modal',
  standalone: true,
  providers: [BillStore],
  imports: [
    VoucherTiles, LedgerBookings,
    SvgIconPipe, PrettyDatePipe, AvatarPipe,
    Header,
    IonContent, IonCard, IonCardContent, IonIcon, IonItem, IonLabel, IonChip, IonAvatar, IonImg, IonButton
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
          </ion-card-content>
        </ion-card>
        <!-- the linked bookings (bill + payments) as journal rows, each linked to its booking in the journal; an unlinked bill: its booking accounts -->
        <okr-ledger-bookings [accountingTenantId]="bill.accountingTenantId" [bookingKeys]="bookingKeys()"
          [accountKeys]="accountKeys()" [date]="bill.billDate" />
      }
      <!-- attachments migrated from bexio: finance-documents okeys, files in the private bucket (spec 1.74) -->
      <okr-voucher-tiles [documentKeys]="voucherKeys()" />
    </ion-content>
  `
})
export class BillViewModal {
  protected readonly store = inject(BillStore);
  private readonly avatarDetailService = inject(AvatarDetailService);

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
  protected readonly vendorName = computed(() => {
    const vendor = this.bill()?.vendor;
    return vendor ? vendor.label || getFullName(vendor.name1, vendor.name2) : '';
  });
  protected readonly paymentDate = computed(() => this.bill()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.bill()?.notes ?? '');
  // legacy bills still hold bexio file UUIDs — only migrated keys are vouchers
  protected readonly voucherKeys = computed(() => (this.bill()?.attachments ?? []).filter(a => a.startsWith('bexio-file-')));

  protected async showVendor(): Promise<void> {
    await this.avatarDetailService.show(this.bill()?.vendor);
  }
}
