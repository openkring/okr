import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ModalController, ToastController,
  IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { canDeleteExpense, canOpenBooking, canOpenTask, canRedoOcr, canViewExpense, centsToCHF } from '@okr/finance-expense-util';

import { ExpenseNewModal } from './expense-new.modal';
import { ExpenseListId, ExpenseStore } from './expense.store';

@Component({
  selector: 'okr-expense-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonMenuButton,
    IonContent, IonList, IonItem, IonLabel, IonPopover, IonFab, IonFabButton,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        @if (canAdd()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
              [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (store.expenses().length === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list>
          @for (expense of store.expenses(); track expense.okey) {
            <ion-item button (click)="openActions(expense)">
              <ion-label>
                <h3>{{ expense.abstract }}</h3>
                <p>{{ toCHF(expense.amountTotal) }} {{ expense.currency }} · {{ expense.status }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
      @if (canAdd()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="openNew()">
            <ion-icon src="{{ 'add' | svgIcon }}" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class ExpenseList {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly alertService = inject(AlertService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  // route inputs
  public readonly listId = input<ExpenseListId>('my');
  public readonly contextMenuName = input('c-expense');

  protected readonly toCHF = centsToCHF;

  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly canAdd = computed(() => hasRole('registered', this.currentUser()));
  protected readonly popupId = computed(() => `c_expense_${this.listId()}`);
  protected readonly title = computed(() =>
    this.listId() === 'all' ? this.store.i18n.list_title_all() : this.store.i18n.list_title_my()
  );

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed via backdrop/escape — not an error
    switch (selectedMethod) {
      case 'add':    await this.openNew(); break;
      case 'export': await this.exportExpenses(); break;
      default: this.alertService.error(`ExpenseList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected async openNew(): Promise<void> {
    const modal = await this.modalController.create({ component: ExpenseNewModal });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'confirm') this.store.expensesResource.reload();
  }

  protected async openActions(expense: ExpenseModel): Promise<void> {
    const user = this.currentUser();
    const i = this.store.i18n;
    const options = createActionSheetOptions(i.as_title());
    if (canViewExpense(expense, user))    options.buttons.push(createActionSheetButton('expense.view', i.action_view(), this.imgixBaseUrl, 'eye-on'));
    if (canOpenTask(expense, user))       options.buttons.push(createActionSheetButton('expense.openTask', i.action_openTask(), this.imgixBaseUrl, 'checkbox'));
    if (canOpenBooking(expense, user))    options.buttons.push(createActionSheetButton('expense.openBooking', i.action_openBooking(), this.imgixBaseUrl, 'booking'));
    if (canRedoOcr(expense, user))        options.buttons.push(createActionSheetButton('expense.redoOcr', i.action_redoOcr(), this.imgixBaseUrl, 'reload'));
    if (canDeleteExpense(expense, user)) {
      options.buttons.push(createActionSheetDivider());
      options.buttons.push(createActionSheetButton('expense.delete', i.action_delete(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('cancel', i.action_cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    switch (data?.action) {
      case 'expense.view':        await this.store.openDetail(expense); break;
      case 'expense.openTask':    await this.store.openTask(expense); break;
      case 'expense.openBooking': await this.store.openBooking(expense); break;
      case 'expense.redoOcr':     await this.store.redoOcr(expense); break;
      case 'expense.delete':      await this.store.deleteExpense(expense); break;
    }
  }

  private async exportExpenses(): Promise<void> {
    // TODO: implement expense export (treasurer only). Wired via the 'expense-export' context-menu item.
    const toast = await this.toastController.create({
      message: 'Export folgt in Kürze.',
      duration: 2500,
    });
    await toast.present();
  }
}
