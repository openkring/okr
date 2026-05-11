import { AsyncPipe, SlicePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController, ActionSheetOptions, ModalController,
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonContent, IonIcon, IonItem,
  IonLabel, IonList, IonSearchbar, IonToolbar,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { WebsiteContentModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocWebsiteStore } from './aoc-website.store';
import { AocWebsiteEditModal } from './aoc-website-edit.modal';

@Component({
  selector: 'bk-aoc-website',
  standalone: true,
  imports: [
    AsyncPipe, SlicePipe, FormsModule, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [AocWebsiteStore],
  template: `
    <bk-header title="@aoc.website.title" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar
          [value]="store.searchTerm()"
          [placeholder]="('@general.operation.search.placeholder' | translate | async) ?? ''"
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
            {{ '@aoc.website.list.title' | translate | async }}
            <ion-badge color="medium">{{ store.filteredItems().length }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if (store.isLoading()) {
            <ion-item lines="none">
              <ion-label>{{ '@general.operation.loading' | translate | async }}</ion-label>
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
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('website.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('website.delete', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

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
