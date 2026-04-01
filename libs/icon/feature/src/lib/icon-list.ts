import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import {
  ActionSheetController, ActionSheetOptions,
  IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover,
  IonRow, IonThumbnail, IonTitle, IonToolbar,
  PopoverController, ToastController
} from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared-i18n';
import { IconModel, RoleName } from '@bk2/shared-models';
import { FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { ICON_SETS, IconStore } from './icon.store';

@Component({
  selector: 'bk-icon-list',
  standalone: true,
  imports: [
    TranslatePipe, SvgIconPipe, FileSizePipe, PrettyDatePipe, AsyncPipe,
    SpinnerComponent, EmptyListComponent, ListFilterComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonGrid, IonRow, IonCol, IonLabel, IonContent, IonItem, IonList, IonPopover, IonThumbnail
  ],
  providers: [IconStore],
  styles: [`
    ion-card-content { padding: 0px;}
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
    ion-textarea { margin-top: 10px;}
    .icon-grid-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      aspect-ratio: 1 / 1;
      background: var(--ion-color-light);
      border-radius: 8px;
      padding: 12%;
      box-sizing: border-box;
    }
    .icon-grid-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .icon-grid-label {
      font-size: 0.75rem;
      margin: 4px 0 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
  `],
  template: `
    <ion-header>
      @if(contextMenuName() !== 'disable') {
        <ion-toolbar color="secondary">
          @if(showMainMenu() === true) {
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          }
          <ion-title>{{ filteredCount() }}/{{ store.iconsCount() }} {{ '@icon.plural' | translate | async }}</ion-title>
          @if(hasRole('privileged') || hasRole('admin')) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon}}" />
              </ion-button>
              <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
                (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <ion-list>
                      <ion-item button (click)="dismissPopover('add')">
                        <ion-label>{{ '@icon.operation.create.label' | translate | async }}</ion-label>
                      </ion-item>
                      <ion-item button (click)="dismissPopover('exportRaw')">
                        <ion-label>{{ '@icon.operation.exportRaw.label' | translate | async }}</ion-label>
                      </ion-item>
                      @if(hasRole('admin')) {
                        <ion-item button (click)="dismissPopover('sync')">
                          <ion-label>{{ '@icon.operation.sync.label' | translate | async }}</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  </ion-content>
                </ng-template>
              </ion-popover>
            </ion-buttons>
          }
        </ion-toolbar>
      }

      <!-- search and filters -->
      <bk-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (tagChanged)="onTagSelected($event)" [tags]="tags()"
        [strings]="iconSets" [selectedString]="store.selectedDir()" (stringsChanged)="store.setSelectedDir($event)"
        [initialView]="view()" (viewToggleChanged)="onViewChange($event)"
      />

      <!-- list header -->
      @if(isListView()) {
        <ion-toolbar color="primary">
          <ion-grid>
            <ion-row>
              <ion-col size="5" size-md="4">
                <ion-label><strong>{{ '@icon.field.name.label' | translate | async }}</strong></ion-label>
              </ion-col>
              <ion-col size="3" size-md="3" class="ion-hide-md-down">
                <ion-label><strong>{{ '@icon.field.type.label' | translate | async }}</strong></ion-label>
              </ion-col>
              <ion-col size="2">
                <ion-label><strong>{{ '@icon.field.size.label' | translate | async }}</strong></ion-label>
              </ion-col>
              <ion-col size="2">
                <ion-label><strong>{{ '@icon.field.updated.label' | translate | async }}</strong></ion-label>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-toolbar>
      }
    </ion-header>

  <!-- list data -->
    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredIcons().length === 0) {
        <bk-empty-list message="@icon.empty" />
      } @else if(isListView()) {
        <!-- list view -->
        <ion-list lines="inset">
          @for(icon of store.filteredIcons(); track icon.bkey) {
            <ion-item (click)="showActions(icon)">
              <ion-thumbnail slot="start">
                <img [src]="icon.name | svgIcon:icon.type" [alt]="icon.name" />
              </ion-thumbnail>
              <ion-label>{{ icon.name }}</ion-label>
              <ion-label class="ion-hide-md-down">{{ icon.type }}</ion-label>
              <ion-label>{{ icon.size | fileSize }}</ion-label>
              <ion-label>{{ icon.updated | prettyDate }}</ion-label>
            </ion-item>
          }
        </ion-list>
      } @else {
        <!-- grid view -->
        <ion-grid>
          <ion-row>
            @for(icon of store.filteredIcons(); track icon.bkey) {
              <ion-col size="4" size-md="3" size-xl="2" (click)="showActions(icon)">
                <div class="icon-grid-cell">
                  <img class="icon-grid-img" [src]="icon.name | svgIcon:icon.type" [alt]="icon.name" />
                </div>
                <p class="icon-grid-label">{{ icon.name }}</p>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `
})
export class IconListComponent {
  protected readonly store = inject(IconStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly popoverController = inject(PopoverController);

  // inputs
  public listId = input.required<string>(); // always all
  public contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'list' | 'grid'>('grid'); // initial view mode
  public showMainMenu = input<boolean>(true);

  // filters
  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected selectedTag = linkedSignal(() => this.store.selectedTag());

  // data
  protected isListView = linkedSignal(() => this.view() === 'grid');

  protected filteredCount = computed(() => this.store.filteredIcons().length);
  protected popupId = computed(() => `c_icon_${this.listId()}`);
  protected currentUser = computed(() => this.store.currentUser());
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));
  protected tags = computed(() => this.store.tags());

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  protected iconSets = ICON_SETS;

  /******************************** setters (filter) ******************************************* */
  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  /******************************* context menu *************************************** */
  protected async dismissPopover(action: string): Promise<void> {
    await this.popoverController.dismiss(action);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'sync': await this.store.sync(); break;
      default: error(undefined, `IconListComponent.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /******************************* actions *************************************** */
  protected async showActions(icon: IconModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, icon);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    actionSheetOptions.buttons.push(createActionSheetButton('icon.copy', this.imgixBaseUrl, 'copy'));
    actionSheetOptions.buttons.push(createActionSheetButton('icon.edit', this.imgixBaseUrl, 'edit'));
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('icon.delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, icon: IconModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(actionSheetOptions);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    console.log('IconList.executeActions: ', data);
    if (data) {
      switch (data.action) {
        case 'icon.copy':
          await copyToClipboardWithConfirmation(this.toastController, icon.name);
          break;
        case 'icon.edit':
          await this.store.edit(icon, false, this.readOnly());
          break;
        case 'icon.delete':
          await this.store.delete(icon, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onViewChange(showList: boolean): void {
    this.isListView.set(showList);
  }
}
