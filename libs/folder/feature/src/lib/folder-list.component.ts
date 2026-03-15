import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, effect } from '@angular/core';
import { ActionSheetController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { FolderModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { FolderStore } from './folder.store';

@Component({
  selector: 'bk-folder-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonToolbar, IonHeader, IonButtons, IonTitle, IonMenuButton, IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonPopover
  ],
  providers: [FolderStore],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar [color]="color()">
          @if(showMainMenu() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ filteredFoldersCount() }}/{{ foldersCount() }} {{ '@folder.plural' | translate | async }}</ion-title>
          @if(!readOnly()) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <bk-menu [menuName]="contextMenuName()" />
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }
      <bk-list-filter (searchTermChanged)="onSearchTermChange($event)" />
    </ion-header>

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(filteredFoldersCount() === 0) {
          <bk-empty-list message="@folder.empty" />
        } @else {
          <ion-list>
            @for(folder of filteredFolders(); track folder.bkey) {
              <ion-item (click)="showActions(folder)">
                <ion-icon slot="start" src="{{ 'folder' | svgIcon }}" />
                <ion-label>
                  <h3>{{ folder.name }}</h3>
                  <p>{{ folder.description }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `
})
export class FolderListComponent {
  protected readonly folderStore = inject(FolderStore);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public readonly contextMenuName = input.required<string>();
  public color = input('secondary');
  public showMainMenu = input<boolean>(true);

  // data
  protected readonly filteredFolders = computed(() => this.folderStore.filteredFolders());
  protected readonly foldersCount = computed(() => this.folderStore.folders().length);
  protected readonly filteredFoldersCount = computed(() => this.filteredFolders().length);
  protected readonly isLoading = computed(() => this.folderStore.isLoading());
  protected readonly currentUser = computed(() => this.folderStore.currentUser());
  protected readonly readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected readonly popupId = computed(() => `c_folders_list`);

  private imgixBaseUrl = this.folderStore.appStore.env.services.imgixBaseUrl;

  /******************************** setters ******************************************* */
  protected onSearchTermChange(searchTerm: string): void {
    this.folderStore.setSearchTerm(searchTerm);
  }

  /******************************* actions *************************************** */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.folderStore.add(); break;
      default: error(undefined, `FolderListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(folder: FolderModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('folder.cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('folder.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('folder.delete', this.imgixBaseUrl, 'trash_delete'));
    }

    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'folder.edit': await this.folderStore.edit(folder, this.readOnly()); break;
        case 'folder.delete': await this.folderStore.delete(folder); break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
