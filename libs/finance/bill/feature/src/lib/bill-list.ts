import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BillModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, getYear, getYearList, hasRole } from '@okr/shared-util-core';

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
    .bill-id { font-size: 0.8rem; }
    .bill-title { font-size: 1rem; }
    .amount { text-align: right; }
    .state { text-align: right; }
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
              <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
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
            <ion-row (click)="showActions(bill)">
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
                  <p class="bill-title">{{ bill.title }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2" class="ion-align-self-center ion-text-end">{{ getAmount(bill.totalAmount?.amount) }}</ion-col>
              <ion-col size="2" class="state">
                <ion-chip [outline]="true" size="small" [color]="getStateColor(bill.state)">
                  {{ bill.state }}
                </ion-chip>
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

  // inputs
  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  // computed
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredBills = computed(() => this.store.filteredBills());
  protected readonly filteredCount = computed(() => this.filteredBills().length);
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);
  protected readonly popupId = computed(() => `c_bills_${this.listId()}`);
  protected years = computed(() => getYearList(getYear(), 8));
  protected states = computed(() => this.store.states());

  constructor() {
    effect(() => {
      const listId = this.listId();
      if (listId) this.store.setListId(listId);
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
    return (cents / 100).toFixed(2);
  }

  protected getStateColor(state: string): string {
    switch (state) {
      case 'paid': return 'success';
      case 'overdue': return 'danger';
      case 'draft': return 'warning';
      case 'todo': return 'primary';
    }
    return '';
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      case 'scan': await this.store.scan(); break;
      case 'exportRaw': await this.store.export('raw', this.filteredBills()); break;
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
    if (!this.store.isExternallyManaged() && this.canChange()) {
      options.buttons.push(createActionSheetButton('bill.edit', this.store.i18n.update(), base, 'edit'));
      if (this.hasRole('admin')) {
        options.buttons.push(createActionSheetButton('bill.delete', this.store.i18n.delete(), base, 'trash'));
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
      case 'bill.edit': await this.store.edit(bill); break;
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
