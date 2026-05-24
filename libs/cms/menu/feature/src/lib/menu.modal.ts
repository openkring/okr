import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, MenuItemModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { MenuForm } from '@bk2/cms-menu-ui';
import { MenuStore } from './menu.store';

@Component({
  selector: 'bk-menu-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, MenuForm,
    IonContent
  ],
  providers: [MenuStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
      }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-menu-item-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [roles]="roles()"
          [types]="types()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          [allTags]="tags()"
          [i18n]="store.i18n"
          (iconSelectClicked)="selectIcon()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class MenuModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(MenuStore);

  // inputs
  public menuItem = input.required<MenuItemModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public roles = input.required<CategoryListModel>();
  public types = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => safeStructuredClone(this.menuItem()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.menuItem().bkey));
  protected tenantId = computed(() => this.store.tenantId());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.menuItem()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MenuItemModel): void {
    this.formData.set(formData);
  }

  protected async selectIcon(): Promise<void> {
    const { IconSelectModal: IconSelectModal } = await import('@bk2/icon-feature');
    const modal = await this.modalController.create({
      component: IconSelectModal,
      componentProps: {
        initialDir: 'icons'
      },
      cssClass: 'list-modal'
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      if (data && typeof(data) === 'string') {
        const icon = data as string;
        this.formData.update((vm) => ({ ...vm, icon }) as MenuItemModel);
        this.formDirty.set(true);
      }
    }
  }
}


