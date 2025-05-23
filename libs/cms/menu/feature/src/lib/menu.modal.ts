import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { MenuItemModel, ModelType, UserModel } from '@bk2/shared/models';
import { MenuItemFormComponent } from '@bk2/cms/menu/ui';
import { convertFormToMenuItem, convertMenuItemToForm, getMenuItemTitle } from '@bk2/cms/menu/util';
import { ENV, RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { AppStore } from '@bk2/auth/feature';

@Component({
  selector: 'bk-menu-item-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    MenuItemFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-menu-item-form [(vm)]="vm" [currentUser]="currentUser()" [menuItemTags]="menuItemTags()" (validChange)="formIsValid.set($event)" />
    </ion-content>
  `
})
export class MenuItemModalComponent {
  private readonly modalController = inject(ModalController);
  protected env = inject(ENV);
  private readonly appStore = inject(AppStore);

  public menuItem = input.required<MenuItemModel>();
  public currentUser = input.required<UserModel>();
  
  protected vm = linkedSignal(() => convertMenuItemToForm(this.menuItem()));
  protected title = computed(() => getMenuItemTitle(this.menuItem().bkey));
  protected menuItemTags = computed(() => this.appStore.getTags(ModelType.MenuItem));
  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToMenuItem(this.menuItem(), this.vm(), this.env.owner.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}


