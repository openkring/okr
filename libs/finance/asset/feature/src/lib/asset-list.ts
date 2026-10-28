import { Component, computed, inject } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton,
  IonPopover, IonTitle, IonToolbar } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { error } from '@okr/shared-util-angular';
import { contextMenuId } from '@okr/shared-util-core';
import { Menu, MenuItemsStore } from '@okr/cms-menu-feature';
import { AccountingBooks, AccountingSegments } from '@okr/finance-accounting-feature';

import { AssetStore } from './asset.store';

/** The route `/accounting/:books/assets` carries no menu param (its url stays as it is), so the menu is fixed. */
const ASSET_CONTEXT_MENU = 'c-asset';

@Component({
  selector: 'okr-asset-list',
  standalone: true,
  imports: [AccountingSegments, AccountingBooks, Menu, SvgIconPipe, IonHeader, IonButtons, IonButton, IonMenuButton,
    IonPopover, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonIcon],
  providers: [AssetStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.assets().length }} {{ store.i18n.list_title() }}</ion-title>
        <okr-accounting-books slot="end" />
        @if (!store.isReadOnly()) {
          <ion-buttons slot="end">
            @if (menuItemsStore.canOpen(contextMenuName)) {
              <ion-button id="{{ popupId }}">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
              <ion-popover trigger="{{ popupId }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                <ng-template>
                  <ion-content>
                    <okr-menu [menuName]="contextMenuName" />
                  </ion-content>
                </ng-template>
              </ion-popover>
            }
          </ion-buttons>
        }
      </ion-toolbar>
      <okr-accounting-segments />
    </ion-header>
    <ion-content>
      @if (store.isLoading()) { <p>{{ store.i18n.loading() }}</p> }
      @else if (store.assets().length === 0) { <p class="ion-padding">{{ emptyText() }}</p> }
      @else {
        <ion-list>
          @for (asset of store.assets(); track asset.okey) {
            <ion-item button [detail]="false" (click)="store.openEdit(asset, store.isReadOnly())">
              <ion-label>
                <h3>{{ asset.assetNo }} — {{ asset.name }}</h3>
                <p>{{ store.categoryName(asset.categoryKey) }} | {{ asset.acquisitionDate }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class AssetList {
  protected readonly menuItemsStore = inject(MenuItemsStore);
  protected readonly store = inject(AssetStore);
  protected readonly contextMenuName = ASSET_CONTEXT_MENU;
  // unique per instance: Ionic keeps the previous page in the DOM
  protected readonly popupId = contextMenuId('c_assets');

  /** an empty register says how to start, unless the books are read-only */
  protected readonly emptyText = computed(() =>
    this.store.isReadOnly() ? this.store.i18n.empty() : `${this.store.i18n.empty()} ${this.store.i18n.empty_hint()}`);

  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return;
    switch (selectedMethod) {
      case 'add': await this.store.openCreate(); break;
      case 'export': await this.store.export(); break;
      default: error(undefined, `AssetList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }
}
