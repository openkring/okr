import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { OrgNewFormComponent } from '@bk2/subject-org-ui';
import { ORG_NEW_FORM_SHAPE, OrgNewFormModel } from '@bk2/subject-org-util';

@Component({
  selector: 'bk-org-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, OrgNewFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@subject.org.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-org-new-form 
        [formData]="formData()" 
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [types]="types()"
        (formDataChange)="onFormDataChange($event)" 
      />
    </ion-content>
  `
})
export class OrgNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public currentUser = input<UserModel | undefined>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = signal(ORG_NEW_FORM_SHAPE);

  // derived signals
  protected readonly tags = computed(() => this.appStore.getTags('org'));
  protected readonly types = computed(() => this.appStore.getCategory('org_type'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(ORG_NEW_FORM_SHAPE);  // reset the form
  }

  protected onFormDataChange(formData: OrgNewFormModel): void {
    this.formData.set(formData);
  }
}
