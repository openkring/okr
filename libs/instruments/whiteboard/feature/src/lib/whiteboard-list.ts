import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { RoleName, WhiteboardModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';

import { WhiteboardStore } from './whiteboard.store';

/**
 * Smart list of whiteboards. Header count + context popover (add), per-item ActionSheet
 * (open / edit / delete). Tapping "open" navigates to the full-page canvas editor. Mirrors
 * `FolderList`; the store is component-provided (see the store↔modal DI contract).
 */
@Component({
  selector: 'okr-whiteboard-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, ListFilter, EmptyList, Menu,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonPopover,
  ],
  providers: [WhiteboardStore],
  template: `
    <ion-header>
      @if (contextMenuName() !== 'disable') {
        <ion-toolbar [color]="color()">
          @if (showMenuButton() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ filteredCount() }}/{{ totalCount() }} {{ store.i18n.plural() }}</ion-title>
          @if (!readOnly()) {
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
      }
      <okr-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else {
        @if (filteredCount() === 0) {
          <okr-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list>
            @for (whiteboard of filteredWhiteboards(); track whiteboard.okey) {
              <ion-item button (click)="showActions(whiteboard)">
                <ion-icon slot="start" src="{{ 'easel' | svgIcon }}" />
                <ion-label>
                  <h3>{{ whiteboard.name }}</h3>
                  <p>{{ whiteboard.description }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
})
export class WhiteboardList {
  protected readonly store = inject(WhiteboardStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  public readonly contextMenuName = input.required<string>();
  public color = input('secondary');
  public showMenuButton = input<boolean>(true);

  protected readonly filteredWhiteboards = computed(() => this.store.filteredWhiteboards());
  protected readonly totalCount = computed(() => this.store.whiteboards().length);
  protected readonly filteredCount = computed(() => this.filteredWhiteboards().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected readonly popupId = computed(() => `c_whiteboards_list`);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return;
    switch (selectedMethod) {
      case 'add': await this.store.add(); break;
      default: this.alertService.error(`WhiteboardList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(whiteboard: WhiteboardModel): Promise<void> {
    const options = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('whiteboard.open', this.store.i18n.as_open(), this.imgixBaseUrl, 'eye-on'));
    if (!this.readOnly()) {
      options.buttons.push(createActionSheetButton('whiteboard.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      options.buttons.push(createActionSheetButton('whiteboard.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }
    if (hasRole('registered', this.currentUser())) {
      options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    }

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'whiteboard.open': await this.open(whiteboard); break;
      case 'whiteboard.edit': await this.store.editMeta(whiteboard, this.readOnly()); break;
      case 'whiteboard.delete': await this.store.delete(whiteboard); break;
    }
  }

  private async open(whiteboard: WhiteboardModel): Promise<void> {
    await this.router.navigate(['/whiteboard', whiteboard.okey]);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
