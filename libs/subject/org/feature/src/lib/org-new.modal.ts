import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { PFX } from './scope';
import { OrgNewForm } from '@bk2/subject-org-ui';
import { CategoryListModel, UserModel } from '@bk2/shared-models';

import { ORG_NEW_FORM_SHAPE, OrgNewFormModel } from '@bk2/subject-org-util';

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
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        <bk-org-new-form 
          [formData]="formData()"
          (formDataChange)="onFormDataChange($event)"
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
  private readonly modalController = inject(ModalController);
  private readonly i18nService = inject(I18nService);
  private readonly confirmI18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.confirmI18n.changeConfirmation_ok(),
    cancel: this.confirmI18n.changeConfirmation_cancel(),
    confirmation: this.confirmI18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  // inputs
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = signal(ORG_NEW_FORM_SHAPE);
  protected showForm = signal(true);

  // derived signals

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
