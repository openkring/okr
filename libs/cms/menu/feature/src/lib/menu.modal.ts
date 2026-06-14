import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { CategoryListModel, MenuItemModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, ErrorBanner, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { MenuForm } from '@bk2/cms-menu-ui';
import { MENU_I18N_KEYS, MenuI18n } from '@bk2/cms-menu-util';

import { MenuStore } from './menu.store';

@Component({
  selector: 'bk-menu-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, ErrorBanner, MenuForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      }
    <bk-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-menu-item-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [roles]="roles()"
          [types]="types()"
          [tenantId]="tenantId"
          [readOnly]="isReadOnly()"
          [allTags]="tags()"
          [i18n]="i18n"
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
  protected readonly i18n = inject(I18nService).translateAll(MENU_I18N_KEYS) as MenuI18n;
  protected readonly tenantId = inject(ENV).tenantId;

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
  protected headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.menuItem().bkey?.length > 0 ? this.i18n.edit() : this.i18n.create();
  });
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

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
    const { IconSelectModal: IconSelectModal } = await import('@bk2/cms-icon-feature');
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


