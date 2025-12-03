import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CategoryListFormComponent } from '@bk2/category-ui';
import { CategoryListFormModel, convertCategoryListToForm, convertFormToCategoryList } from '@bk2/category-util';

@Component({
  selector: 'bk-category-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, CategoryListFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent
  ],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      <bk-category-list-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [categoryTags]="tags()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `
})
export class CategoryEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public category = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertCategoryListToForm(this.category()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('category', this.category()?.bkey, this.isReadOnly()));
  protected tags = computed(() => this.appStore.getTags('category'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToCategoryList(this.formData(), this.category()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertCategoryListToForm(this.category()));  // reset the form
  }

  protected onFormDataChange(formData: CategoryListFormModel): void {
    this.formData.set(formData);
  }
}
