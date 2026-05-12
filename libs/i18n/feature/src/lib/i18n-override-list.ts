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
import { I18nTenantOverrideModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { I18nOverrideStore } from './i18n-override.store';
import { I18nOverrideEditModal } from './i18n-override-edit.modal';

@Component({
  selector: 'bk-i18n-override-list',
  standalone: true,
  imports: [
    AsyncPipe, SlicePipe, FormsModule, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [I18nOverrideStore],
  template: `
    <bk-header title="@i18n.override.title" />
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
            {{ '@i18n.override.list.title' | translate | async }}
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
export class I18nOverrideList {
  protected readonly store = inject(I18nOverrideStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    this.store.setSearchTerm((event as CustomEvent).detail.value ?? '');
  }

  protected async showActions(item: I18nTenantOverrideModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('i18n.override.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('i18n.override.delete', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'i18n.override.edit':
        await this.openEditModal(item);
        break;
      case 'i18n.override.delete':
        await this.store.deleteItem(item);
        break;
    }
  }

  private async openEditModal(item: I18nTenantOverrideModel): Promise<void> {
    const modal = await this.modalController.create({
      component: I18nOverrideEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<I18nTenantOverrideModel>();
    if (role === 'confirm' && data) {
      await this.store.saveItem(data);
    }
  }
}
