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
import { WebsiteContentModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocWebsiteStore } from './aoc-website.store';
import { AocWebsiteEditModal } from './aoc-website-edit.modal';

@Component({
  selector: 'bk-aoc-website',
  standalone: true,
  imports: [
    SlicePipe, FormsModule, SvgIconPipe,
    Header,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [AocWebsiteStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.title()}" />
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
                  <h3>{{ item.key }}</h3>
                  <p>de: {{ item.de | slice:0:60 }}</p>
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
export class AocWebsite {
  protected readonly store = inject(AocWebsiteStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    this.store.setSearchTerm(value);
  }

  protected async showActions(item: WebsiteContentModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('website.edit', this.store.i18n.edit(), base, 'edit'));
    options.buttons.push(createActionSheetButton('website.delete', this.store.i18n.delete_label(), base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'website.edit':
        await this.openEditModal(item);
        break;
      case 'website.delete':
        await this.store.deleteItem(item);
        break;
    }
  }

  private async openEditModal(item: WebsiteContentModel): Promise<void> {
    const modal = await this.modalController.create({
      component: AocWebsiteEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<WebsiteContentModel>();
    if (role === 'confirm' && data) {
      await this.store.saveItem(data);
    }
  }
}
