import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

import { GroupNewFormComponent } from '@bk2/subject-group-ui';
import { GROUP_NEW_FORM_SHAPE, GroupNewFormModel } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, GroupNewFormComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@subject.group.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-group-new-form
        [formData]="formData()"
        [currentUser]="currentUser()"
        [allTags]="tags()"
        [readOnly]="isReadOnly()"
        (formDataChange)="onFormDataChange($event)" 
      />
    </ion-content>
  `
})
export class GroupNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = signal(GROUP_NEW_FORM_SHAPE);

  // fields
  protected readonly tags = computed(() => this.appStore.getTags('group'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(GROUP_NEW_FORM_SHAPE);  // reset the form
  }

  protected onFormDataChange(formData: GroupNewFormModel): void {
    this.formData.set(formData);
  }
}
