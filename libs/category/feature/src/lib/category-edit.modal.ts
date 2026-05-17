import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, Header } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';

import { CategoryListForm } from '@bk2/category-ui';

@Component({
  selector: 'bk-category-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CategoryListForm,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        @if(formData(); as formData) {
          <bk-category-list-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenants]="env.tenantId"
            [hasAbbreviation]="hasAbbreviation()"
            [readOnly]="isReadOnly()"
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
  protected readonly env = inject(ENV);

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
  protected readonly headerTitle = computed(() => getTitleLabel('category', this.category()?.bkey, this.isReadOnly()));

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
