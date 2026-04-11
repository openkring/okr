import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { BillModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

import { PersonSelectModalComponent } from '@bk2/shared-feature';
import { AvatarPipe } from '@bk2/avatar-ui';

import { BillStore } from './bill.store';

@Component({
  selector: 'bk-bill-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BillStore],
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, AvatarPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
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
        <ion-title>{{ filteredCount() }} {{ '@finance.bill.list.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(listId() === 'all') {
            @if(selectedVendorName()) {
              <ion-button fill="clear" (click)="clearVendorFilter()">
                {{ selectedVendorName() }}
                <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="end" />
              </ion-button>
            } @else {
              <ion-button fill="clear" (click)="selectVendor()">
                <ion-icon src="{{ 'person' | svgIcon }}" slot="icon-only" />
              </ion-button>
            }
          }
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else if(filteredBills().length === 0) {
        <bk-empty-list message="@finance.bill.field.empty" />
      } @else {
        <ion-grid>
          @for(bill of filteredBills(); track bill.bkey) {
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
  private readonly modalController = inject(ModalController);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly listId = input.required<string>();

  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredBills = computed(() => this.store.filteredBills());
  protected readonly filteredCount = computed(() => this.filteredBills().length);
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);

  protected readonly selectedVendorName = signal('');

  constructor() {
    effect(() => {
      const listId = this.listId();
      if (listId) this.store.setListId(listId);
    });
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected formatDate(storeDate: string): string {
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate) ?? storeDate;
  }

  protected async selectVendor(): Promise<void> {
    const currentUser = this.currentUser();
    if (!currentUser) return;
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      componentProps: { selectedTag: '', currentUser },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      this.store.setListId(data.bkey);
      const name = [data.firstName, data.lastName].filter(Boolean).join(' ');
      this.selectedVendorName.set(name);
      this.cdr.markForCheck();
    }
  }

  protected clearVendorFilter(): void {
    this.store.setListId('all');
    this.selectedVendorName.set('');
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

  protected async showActions(bill: BillModel): Promise<void> {
    const options = createActionSheetOptions('@actionsheet.label.choose');
    const base = this.imgixBaseUrl();
    options.buttons.push(createActionSheetButton('bill.view', base, 'eye-on'));
    if (bill.attachments.length > 0) {
      options.buttons.push(createActionSheetButton('bill.download', base, 'download'));
    }
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bill.view': await this.store.view(bill); break;
      case 'bill.download': await this.store.showPdf(bill); break;
    }
    this.cdr.markForCheck();
  }
}
