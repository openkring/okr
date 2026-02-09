import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { OrgNewFormComponent } from '@bk2/subject-org-ui';
import { CategoryListModel, UserModel } from '@bk2/shared-models';

import { ORG_NEW_FORM_SHAPE, OrgNewFormModel } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-new-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, OrgNewFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="@subject.org.operation.create.label" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
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
export class OrgNewModalComponent {
  private readonly modalController = inject(ModalController);

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
