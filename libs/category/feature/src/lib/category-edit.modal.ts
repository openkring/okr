import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CategoryListFormComponent } from '@bk2/category-ui';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-category-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, CategoryListFormComponent,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(currentUser(); as currentUser) {
        <bk-category-list-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser"
          [allTags]="tags()"
          [tenants]="env.tenantId"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class CategoryEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly env = inject(ENV);

  // inputs
  public category = input.required<CategoryListModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.category()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('category', this.category()?.bkey, this.isReadOnly()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.category()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: CategoryListModel): void {
    this.formData.set(formData);
  }
}
