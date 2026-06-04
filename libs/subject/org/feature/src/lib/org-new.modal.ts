import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { OrgNewForm } from '@bk2/subject-org-ui';
import { CategoryListModel, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';

import { ORG_I18N_KEYS, ORG_NEW_FORM_SHAPE, OrgI18n, OrgNewFormModel } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-new-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, OrgNewForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: '@subject.org.operation.create.label' }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        <bk-org-new-form
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [currentUser]="currentUser"
          [allTags]="tags()"
          [types]="types()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class OrgNewModal {
  protected readonly i18n = inject(I18nService).translateAll(ORG_I18N_KEYS) as OrgI18n;
  private readonly modalController = inject(ModalController);

  // inputs
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = signal(ORG_NEW_FORM_SHAPE);
  protected showForm = signal(true);

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(ORG_NEW_FORM_SHAPE);  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OrgNewFormModel): void {
    this.formData.set(formData);
  }
}
