import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MenuItemModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { MenuItemFormComponent } from '@bk2/cms-menu-ui';
import { convertFormToMenuItem, convertMenuItemToForm, getMenuItemTitle } from '@bk2/cms-menu-util';

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
    <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-menu-item-form [(vm)]="vm"
        [currentUser]="currentUser()"
        [roles]="roles()"
        [type]="types()"
        [allTags]="allTags()"
        (validChange)="formIsValid.set($event)"
      />
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
  protected allTags = computed(() => this.appStore.getTags('menuitem'));
  protected roles = computed(() => this.appStore.getCategory('roles'));
  protected types = computed(() => this.appStore.getCategory('menu_action'));

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToMenuItem(this.menuItem(), this.vm(), this.env.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}


