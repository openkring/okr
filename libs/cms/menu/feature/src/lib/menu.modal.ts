import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { MenuItemFormComponent } from '@bk2/cms-menu-ui';
import { convertFormToMenuItem, convertMenuItemToForm, MenuItemFormModel } from '@bk2/cms-menu-util';

@Component({
  selector: 'bk-menu-item-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    MenuItemFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      } 
    <ion-content no-padding>
      @if(formData(); as formData) {
        <bk-menu-item-form
          [formData]="formData"
          [currentUser]="currentUser()"
          [roles]="roles()"
          [type]="types()"
          [readOnly]="isReadOnly()"
          [allTags]="tags()"
          (formDataChange)="onFormDataChange($event)"
        />
      }
    </ion-content>
  `
})
export class MenuItemModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public menuItem = input.required<MenuItemModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertMenuItemToForm(this.menuItem()));

  // derived signals
  protected currentUser = computed(() => this.appStore.currentUser());
  protected headerTitle = computed(() => getTitleLabel('menuItem', this.menuItem().bkey, this.isReadOnly()));
  protected tags = computed(() => this.appStore.getTags('menuitem'));
  protected roles = computed(() => this.appStore.getCategory('roles'));
  protected types = computed(() => this.appStore.getCategory('menu_action'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToMenuItem(this.formData(), this.menuItem()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertMenuItemToForm(this.menuItem()));  // reset the form
  }

  protected onFormDataChange(formData: MenuItemFormModel): void {
    this.formData.set(formData);
  }
}


