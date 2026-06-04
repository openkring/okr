import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';

import { CategoryListForm } from '@bk2/category-ui';
import { CATEGORY_I18N_KEYS, CategoryI18n } from '@bk2/category-util';

@Component({
  selector: 'bk-category-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CategoryListForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-category-list-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenants]="tenantId()"
            [hasAbbreviation]="hasAbbreviation()"
            [readOnly]="isReadOnly()"
            [i18n]="i18n"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class CategoryEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(CATEGORY_I18N_KEYS) as CategoryI18n;
  protected readonly appStore = inject(AppStore);

  // inputs
  public category = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public hasAbbreviation = input<boolean>(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.category()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => {
    if (this.isReadOnly()) return this.i18n.view();
    return this.category()?.bkey ? this.i18n.edit() : this.i18n.create();
  });
  protected tenantId = computed(() => this.appStore.tenantId());
  protected readonly changeConfirmationI18n = computed(() => ({cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.category()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CategoryListModel): void {
    this.formData.set(formData);
  }
}
