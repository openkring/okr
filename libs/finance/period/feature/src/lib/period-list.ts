import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PeriodModel, RoleName } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';

import { ReadOnlyBanner } from '@okr/finance-accounting-feature';

import { PeriodStore } from './period.store';

@Component({
  selector: 'okr-period-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, Menu, ReadOnlyBanner,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonPopover,
  ],
  providers: [PeriodStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ count() }} {{ store.i18n.list_title() }}</ion-title>
        @if (canChange()) {
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
    </ion-header>

    <ion-content>
      <okr-read-only-banner />
      @if (isLoading()) {
        <okr-spinner />
      } @else if (count() === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (period of periods(); track period.okey) {
            <ion-item button [detail]="false" (click)="showActions(period)">
              <ion-icon slot="start" src="{{ (period.isLocked ? 'lock-closed' : 'lock-open') | svgIcon }}" />
              <ion-label>
                <h2>{{ periodLabel(period) }}</h2>
              </ion-label>
              @if (period.isLocked) {
                <ion-badge slot="end" color="warning">{{ store.i18n.locked_label() }}</ion-badge>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class PeriodList {
  protected readonly store = inject(PeriodStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly contextMenuName = input.required<string>();

  protected readonly popupId = computed(() => 'c_periods');
  protected readonly periods = computed(() => this.store.periods());
  protected readonly count = computed(() => this.periods().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  // Locking and creating periods is a treasurer task; an externally managed accounting is read-only for everyone.
  protected readonly canChange = computed(() => !this.store.isReadOnly() && this.hasRole('treasurer'));

  protected periodLabel(period: PeriodModel): string {
    return period.month > 0 ? `${period.year}-${String(period.month).padStart(2, '0')}` : String(period.year);
  }

  /*-------------------------- popover menu --------------------------------*/
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'create': await this.store.createFromPrompt(); break;
      default: error(undefined, `PeriodList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /*-------------------------- per-item action sheet --------------------------------*/
  protected async showActions(period: PeriodModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options, period);
    await this.executeActions(options, period);
  }

  private addActionSheetButtons(options: ActionSheetOptions, period: PeriodModel): void {
    if (this.canChange()) {
      if (period.isLocked) {
        options.buttons.push(createActionSheetButton('period.unlock', this.store.i18n.unlock_action(), this.imgixBaseUrl, 'lock-open'));
      } else {
        options.buttons.push(createActionSheetButton('period.lock', this.store.i18n.lock_action(), this.imgixBaseUrl, 'lock-closed'));
      }
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  private async executeActions(options: ActionSheetOptions, period: PeriodModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'period.lock':   await this.store.lock(period); break;
      case 'period.unlock': await this.store.unlock(period); break;
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
