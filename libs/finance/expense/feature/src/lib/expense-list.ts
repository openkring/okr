import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ActionSheetController, ModalController, ToastController,
  IonAvatar, IonButton, IonButtons, IonCol, IonContent, IonFab, IonFabButton, IonGrid, IonHeader, IonIcon,
  IonImg, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { ExpenseModel, RoleName } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, getItemLabel, hasRole } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { Menu } from '@okr/cms-menu-feature';
import {
  canDeleteExpense, canOpenBooking, canOpenTask, canRedoOcr, canViewExpense, centsToCHF, ExpenseSortField,
} from '@okr/finance-expense-util';

import { ExpenseNewModal } from './expense-new.modal';
import { ExpenseListId, ExpenseStore } from './expense.store';

@Component({
  selector: 'okr-expense-list',
  standalone: true,
  imports: [
    AsyncPipe, SvgIconPipe, TranslatePipe, AvatarPipe,
    Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonMenuButton,
    IonContent, IonList, IonItem, IonLabel, IonPopover, IonFab, IonFabButton,
    IonGrid, IonRow, IonCol, IonAvatar, IonImg,
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .header-row {
      font-weight: 600;
      border-bottom: 1px solid var(--ion-color-step-150, #d7d8da);
      padding-inline: 16px;
    }
    .item-row {
      min-height: 48px;
      align-items: center;
      padding-inline: 16px;
      border-bottom: 1px solid var(--ion-color-step-100, #e5e5e5);
    }
    .item-row:last-of-type { border-bottom: 0; }
    .clickable { cursor: pointer; }
    .name { display: flex; align-items: center; gap: 12px; }
    .num { text-align: right; }
  `],
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
      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        [states]="store.stateCategory()" [selectedState]="store.selectedState()" (stateChanged)="store.setSelectedState($event)"
        [types]="store.transferCategory()" [selectedType]="store.selectedTransfer()" (typeChanged)="store.setSelectedTransfer($event)"
      />

      <!-- sortable column headers: the full set from md up, the three sortable ones below -->
      <ion-toolbar color="light">
        <ion-grid class="ion-no-padding">
          <ion-row class="header-row ion-hide-md-down">
            <ion-col size="2" class="clickable" (click)="store.setSort('date')">{{ store.i18n.col_date() }}{{ sortIcon('date') }}</ion-col>
            @if (showSubmitter()) {
              <ion-col size="3" class="clickable" (click)="store.setSort('name')">{{ store.i18n.col_name() }}{{ sortIcon('name') }}</ion-col>
            }
            <ion-col>{{ store.i18n.col_abstract() }}</ion-col>
            <ion-col size="2" class="num clickable" (click)="store.setSort('amount')">{{ store.i18n.col_amount() }}{{ sortIcon('amount') }}</ion-col>
            <ion-col size="2">{{ store.i18n.col_status() }}</ion-col>
          </ion-row>
          <ion-row class="header-row ion-hide-md-up">
            <ion-col size="4" class="clickable" (click)="store.setSort('date')">{{ store.i18n.col_date() }}{{ sortIcon('date') }}</ion-col>
            @if (showSubmitter()) {
              <ion-col size="4" class="clickable" (click)="store.setSort('name')">{{ store.i18n.col_name() }}{{ sortIcon('name') }}</ion-col>
            }
            <ion-col size="4" class="num clickable" (click)="store.setSort('amount')">{{ store.i18n.col_amount() }}{{ sortIcon('amount') }}</ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <okr-spinner />
      } @else if (expenses().length === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <!-- md and up: one row per expense, columns aligned with the header toolbar -->
        <ion-grid class="ion-no-padding ion-hide-md-down">
          @for (expense of expenses(); track expense.okey) {
            <ion-row class="item-row clickable" (click)="openActions(expense)">
              <ion-col size="2">{{ viewDate(expense) }}</ion-col>
              @if (showSubmitter()) {
                <ion-col size="3" class="name">
                  <ion-avatar>
                    <ion-img src="{{ store.avatarKey(expense) | avatar:'person' }}" alt="Avatar" />
                  </ion-avatar>
                  <span>{{ expense.userName }}</span>
                </ion-col>
              }
              <ion-col>{{ expense.abstract }}</ion-col>
              <ion-col size="2" class="num">{{ amount(expense) }} {{ expense.currency }}</ion-col>
              <ion-col size="2">{{ statusLabel(expense) | translate | async }}</ion-col>
            </ion-row>
          }
        </ion-grid>

        <!-- below md: the compact single-item layout, date first -->
        <ion-list class="ion-hide-md-up" lines="inset">
          @for (expense of expenses(); track expense.okey) {
            <ion-item button [detail]="false" (click)="openActions(expense)">
              @if (showSubmitter()) {
                <ion-avatar slot="start">
                  <ion-img src="{{ store.avatarKey(expense) | avatar:'person' }}" alt="Avatar" />
                </ion-avatar>
              }
              <ion-label>
                <h3>{{ expense.abstract }}</h3>
                <p>{{ viewDate(expense) }} · {{ amount(expense) }} {{ expense.currency }}</p>
                <p>
                  {{ statusLabel(expense) | translate | async }}
                  @if (showSubmitter() && expense.userName) { · {{ expense.userName }} }
                </p>
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

  protected readonly expenses = computed(() => this.store.filteredExpenses());
  /** The submitter column/avatar only makes sense on the 'all' list — on 'my' every row is the user. */
  protected readonly showSubmitter = computed(() => this.listId() === 'all');

  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly canAdd = computed(() => hasRole('registered', this.currentUser()));
  protected readonly popupId = computed(() => `c_expense_${this.listId()}`);
  protected readonly title = computed(() =>
    this.listId() === 'all' ? this.store.i18n.list_title_all() : this.store.i18n.list_title_my()
  );

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  /** creationDateTime is a StoreDateTime; non-strict conversion yields '' for legacy docs without one. */
  protected viewDate(expense: ExpenseModel): string {
    return convertDateFormatToString(expense.creationDateTime, DateFormat.StoreDateTime, DateFormat.ViewDate, false);
  }

  protected amount(expense: ExpenseModel): string {
    return centsToCHF(expense.amountTotal).toFixed(2);
  }

  /** Data-driven i18n key of the status item — resolved with TranslatePipe, not the store. */
  protected statusLabel(expense: ExpenseModel): string {
    return getItemLabel(this.store.stateCategory(), expense.status);
  }

  protected sortIcon(field: ExpenseSortField): string {
    if (this.store.sortField() !== field) return '';
    return this.store.sortAsc() ? ' ↑' : ' ↓';
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
      message: this.store.i18n.export_todo(),
      duration: 2500,
    });
    await toast.present();
  }
}
