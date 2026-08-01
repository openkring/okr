import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBackdrop, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingLineModel, BookingModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { ListFilter } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { BookingAction, isForReview, JournalRow } from '@okr/finance-booking-util';
import { BookingStore } from './booking.store';

@Component({
  selector: 'okr-booking-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu, ListFilter, ReadOnlyBanner,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonIcon, IonButton, IonButtons, IonMenuButton,
    IonPopover, IonBackdrop, IonGrid, IonRow, IonCol,
  ],
  providers: [BookingStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary" id="bkheader">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>
        {{ filteredCount() }}/{{ count() }} {{ store.i18n.list_title() }}
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
                <okr-menu [menuName]="contextMenuName()" />
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
          <ion-col size="3" size-md="2"><ion-label><strong>{{ store.i18n.col_date() }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-sm-down"><ion-label><strong>{{ store.i18n.col_credit() }}</strong></ion-label></ion-col>
          <ion-col size-md="2" class="ion-hide-sm-down"><ion-label><strong>{{ store.i18n.col_debit() }}</strong></ion-label></ion-col>
          <ion-col size="5" size-md="4"><ion-label><strong>{{ store.i18n.col_name() }}</strong></ion-label></ion-col>
          <ion-col size="4" size-md="2" class="ion-text-end"><ion-label><strong>{{ store.i18n.col_amount() }}</strong></ion-label></ion-col>
        </ion-row>
      </ion-grid>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <okr-read-only-banner [message]="store.i18n.read_only_banner()" />
    @if(isLoading()) {
      <okr-spinner />
      <ion-backdrop />
    } @else if(filteredCount() === 0) {
      <okr-empty-list [message]="store.i18n.empty()" />
    } @else {
      <ion-list lines="inset">
        @for(row of filtered(); track row.okey) {
          <ion-item button [detail]="false" (click)="showActions(row)" [class.for-review]="isForReview(row)">
            <ion-grid>
              <ion-row>
                <ion-col size="3" size-md="2">
                  @if(isForReview(row)) {
                    <ion-icon class="review-icon" src="{{ 'alert-circle' | svgIcon }}" [attr.aria-label]="store.i18n.status_forReview()" />
                  }
                  {{ row.date }}
                </ion-col>
                <ion-col size-md="2" class="ion-hide-sm-down">{{ row.creditAccount }}</ion-col>
                <ion-col size-md="2" class="ion-hide-sm-down">{{ row.debitAccount }}</ion-col>
                <ion-col size="5" size-md="4">{{ row.accountName }}</ion-col>
                <ion-col size="4" size-md="2" class="ion-text-end">{{ row.amount }}</ion-col>
              </ion-row>
            </ion-grid>
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
  `,
  styles: [`
    .review-badge {
      margin-left: 0.5rem; padding: 0.1rem 0.45rem;
      border-radius: 0.75rem; font-size: 0.7rem; font-weight: 600;
      background: var(--ion-color-warning); color: var(--ion-color-warning-contrast);
      vertical-align: middle;
    }
    .review-icon { font-size: 1rem; vertical-align: text-bottom; color: var(--ion-color-warning-shade); }
    ion-item.for-review { --background: rgba(var(--ion-color-warning-rgb), 0.12); }
  `],
})
export class BookingList {
  protected readonly store = inject(BookingStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly contextMenuName = input.required<string>();

  protected readonly popupId = computed(() => 'c_bookings');
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filtered = computed(() => this.store.filteredRows());
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly count = computed(() => this.store.bookings().length);
  protected readonly years = computed(() => this.store.years());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => this.store.isReadOnly());
  protected readonly forReviewCount = computed(() => this.store.forReviewCount());
  protected readonly statusCategory = computed(() => this.store.statusCategory());

  protected isForReview(row: JournalRow): boolean {
    return isForReview(row.booking);
  }

  /*-------------------------- popover context menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add':    await this.store.openCreate(); break;
      case 'export': await this.store.export(); break;
      default: error(undefined, `BookingList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /*-------------------------- per-item action sheet --------------------------------*/
  protected async showActions(row: JournalRow): Promise<void> {
    const booking = row.booking;
    const lines = this.store.linesByBooking().get(booking.okey) ?? [];
    const actions = this.store.availableActions(booking);
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, actions, booking);
    await this.executeActions(options, booking, lines, actions);
  }

  private addActionSheetButtons(options: ActionSheetOptions, actions: BookingAction[], booking: BookingModel): void {
    // Treasurer decision on an OCR-proposed booking comes first — it is why the row was opened.
    if (this.store.canReview(booking)) {
      options.buttons.push(createActionSheetButton('booking.approve', this.store.i18n.review_approve(), this.imgixBaseUrl, 'checkmark-circle'));
      options.buttons.push(createActionSheetButton('booking.review',  this.store.i18n.review_correct(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('booking.reject',  this.store.i18n.review_reject(),  this.imgixBaseUrl, 'close-circle'));
      options.buttons.push(createActionSheetDivider());
    }
    if (this.readOnly()) {
      options.buttons.push(createActionSheetButton('booking.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    } else {
      options.buttons.push(createActionSheetButton('booking.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
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
    if (action === 'booking.approve') { await this.store.approve(booking); return; }
    if (action === 'booking.review')  { await this.store.openReview(booking, lines); return; }
    if (action === 'booking.reject')  { await this.store.reject(booking); return; }
    if (action === 'booking.view')   { await this.store.openEdit(booking, lines, true); return; }
    if (action === 'booking.edit')   { await this.store.openEdit(booking, lines, this.readOnly()); return; }
    if (action === 'booking.delete') { await this.store.delete(booking); return; }
    if (action.startsWith('booking.receipt.')) {
      const idx = Number(action.substring('booking.receipt.'.length));
      const bookingAction = actions[idx];
      if (bookingAction) await this.store.runAction(bookingAction, booking);
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
