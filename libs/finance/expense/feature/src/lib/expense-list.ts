import { Component, computed, effect, inject, input } from '@angular/core';
import {
  ModalController, ToastController,
  IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { AlertService } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { centsToCHF } from '@okr/finance-expense-util';

import { ExpenseNewModal } from './expense-new.modal';
import { ExpenseListId, ExpenseStore } from './expense.store';

@Component({
  selector: 'okr-expense-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonMenuButton,
    IonContent, IonList, IonItem, IonLabel, IonPopover,
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
            <ion-item (click)="store.openDetail(expense)">
              <ion-label>
                <h3>{{ expense.abstract }}</h3>
                <p>{{ toCHF(expense.amountTotal) }} {{ expense.currency }} · {{ expense.status }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class ExpenseList {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly alertService = inject(AlertService);

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

  private async openNew(): Promise<void> {
    const modal = await this.modalController.create({ component: ExpenseNewModal });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'confirm') this.store.expensesResource.reload();
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
