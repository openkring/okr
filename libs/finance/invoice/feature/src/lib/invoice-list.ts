import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { InvoiceModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, hasRole } from '@bk2/shared-util-core';

import { PersonSelectModalComponent } from '@bk2/shared-feature';

import { InvoiceStore } from './invoice.store';
import { AvatarPipe } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-invoice-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InvoiceStore],
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, AvatarPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonLabel, IonGrid, IonRow, IonCol, IonAvatar, IonImg, IonChip
  ],
  styles: [`
    .inv-id { font-size: 0.8rem; }
    .inv-title { font-size: 1rem; }
    .amount { text-align: right; }
    .state { text-align: right; }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
    ion-avatar { height: 30px; width: 30px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }} {{ '@finance.invoice.list.title' | translate | async }}</ion-title>
        <ion-buttons slot="end">
          @if(listId() === 'all') {
            @if(selectedPersonName()) {
              <ion-button fill="clear" (click)="clearPersonFilter()">
                {{ selectedPersonName() }}
                <ion-icon src="{{ 'cancel-circle' | svgIcon }}" slot="end" />
              </ion-button>
            } @else {
              <ion-button fill="clear" (click)="selectPerson()">
                <ion-icon src="{{ 'person' | svgIcon }}" slot="icon-only" />
              </ion-button>
            }
          }
<!-- currently, we don't want to show a context menu
                     @if(canChange()) {
            <ion-button [id]="popupId">
              <ion-icon src="{{ 'menu' | svgIcon }}" slot="icon-only" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          } -->
        </ion-buttons>
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else if(filteredInvoices().length === 0) {
        <bk-empty-list message="@finance.invoice.field.empty" />
      } @else {
        <ion-grid>
          @for(invoice of filteredInvoices(); track invoice.bkey) {
            <ion-row (click)="showActions(invoice)">
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
                  <p class="inv-title">{{ invoice.title }}</p>
                </ion-label>
              </ion-col>
              <ion-col size="2"class="ion-align-self-center ion-text-end">{{ getAmount(invoice.totalAmount?.amount)}}</ion-col>
              <ion-col size="2" class="state">
                <ion-chip [outline]="true" size="small" [color]="getStateColor(invoice.state)">
                  {{ invoice.state }}
                </ion-chip>
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
  private readonly modalController = inject(ModalController);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly listId = input.required<string>();  // all, my, personKey
  public readonly contextMenuName = input.required<string>();

  protected readonly popupId = crypto.randomUUID();
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly filteredInvoices = computed(() => this.store.filteredInvoices());
  protected readonly filteredCount = computed(() => this.filteredInvoices().length);
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected readonly imgixBaseUrl = computed(() => this.store.appStore.env.services.imgixBaseUrl);

  protected readonly selectedPersonName = signal('');

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

  protected async selectPerson(): Promise<void> {
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
      this.selectedPersonName.set(name);
      this.cdr.markForCheck();
    }
  }

  protected clearPersonFilter(): void {
    this.store.setListId('all');
    this.selectedPersonName.set('');
  }

  protected getAmount(cents?: number): string {
    if (cents === undefined) return '';
    return (cents / 100).toFixed(2);
  }

  protected getStateColor(state: string): string {
    switch(state) {
      case 'paid': return 'success';
      case 'overdue': return 'danger';
      case 'draft': return 'warning';
    }
    return '';
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      case 'exportRaw': await this.store.export('raw', this.filteredInvoices()); break;
      default: error(undefined, `InvoiceList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  protected async showActions(invoice: InvoiceModel): Promise<void> {
    const options = createActionSheetOptions('@actionsheet.label.choose');
    await this.addActionSheetButtons(options, invoice);
    await this.executeActions(options, invoice);
  }

  private async addActionSheetButtons(options: ActionSheetOptions, _invoice: InvoiceModel): Promise<void> {
    const base = this.imgixBaseUrl();
    options.buttons.push(createActionSheetButton('invoice.view', base, 'eye-on'));
    options.buttons.push(createActionSheetButton('invoice.showpdf', base, 'download'));
/*. invoices are currently read-only; they are processed in Bexio 
    if (this.canChange()) {
      options.buttons.push(createActionSheetButton('invoice.edit', base, 'edit'));
    }
    if (this.canDelete()) {
      options.buttons.push(createActionSheetButton('invoice.delete', base, 'trash'));
    } */
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));
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
      case 'invoice.edit': await this.store.edit(invoice, false); break;
      case 'invoice.delete': await this.store.delete(invoice); break;
    }
    this.cdr.markForCheck();
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected canChange(): boolean {
    return hasRole('treasurer', this.currentUser()) || hasRole('privileged', this.currentUser());
  }

  protected canDelete(): boolean {
    return hasRole('admin', this.currentUser());
  }
}
