import { SlicePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController, ActionSheetOptions, ModalController,
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonContent, IonIcon, IonItem,
  IonLabel, IonList, IonSearchbar, IonToolbar,
} from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { I18nDefaultModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { I18nDefaultStore } from './i18n-default.store';
import { I18nDefaultEditModal } from './i18n-default-edit.modal';

@Component({
  selector: 'bk-i18n-default-list',
  standalone: true,
  imports: [
    SlicePipe, FormsModule, SvgIconPipe,
    Header,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [I18nDefaultStore],
  template: `
    <bk-header [i18n]="{ title: '@i18n.default.title' }" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar
          [value]="store.searchTerm()"
          [placeholder]="store.i18n.search_placeholder()"
          (ionInput)="onSearch($event)"
          debounce="300" />
        <ion-buttons slot="end">
          <ion-button (click)="store.createItem()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ store.i18n.list_title() }}
            <ion-badge color="medium">{{ store.filteredItems().length }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if (store.isLoading()) {
            <ion-item lines="none">
              <ion-label>{{ store.i18n.loading() }}</ion-label>
            </ion-item>
          }
          <ion-list lines="inset">
            @for (item of store.filteredItems(); track item.bkey) {
              <ion-item (click)="showActions(item)" button>
                <ion-icon slot="start" src="{{ 'globe' | svgIcon }}" />
                <ion-label>
                  <h3>{{ item.module }} · {{ item.key }}</h3>
                  <p>{{ item.de | slice:0:80 }}</p>
                </ion-label>
                @if (item.isHtml) {
                  <ion-chip slot="end" color="primary">HTML</ion-chip>
                }
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class I18nDefaultList {
  protected readonly store = inject(I18nDefaultStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    this.store.setSearchTerm((event as CustomEvent).detail.value ?? '');
  }

  protected async showActions(item: I18nDefaultModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton(this.store.i18n.as_edit(), base, 'edit'));
    options.buttons.push(createActionSheetButton(this.store.i18n.as_delete(), base, 'trash'));
    options.buttons.push(createActionSheetButton(this.store.i18n.cancel(), base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'i18n.default.edit':
        await this.openEditModal(item);
        break;
      case 'i18n.default.delete':
        await this.store.deleteItem(item);
        break;
    }
  }

  private async openEditModal(item: I18nDefaultModel): Promise<void> {
    const modal = await this.modalController.create({
      component: I18nDefaultEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<I18nDefaultModel>();
    if (role === 'confirm' && data) {
      await this.store.saveItem(data);
    }
  }
}
