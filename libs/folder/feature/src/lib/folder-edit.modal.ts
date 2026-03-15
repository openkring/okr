import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { FolderModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { FolderFormComponent } from '@bk2/folder-ui';

@Component({
  selector: 'bk-folder-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, FolderFormComponent,
    IonContent
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]="true" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-folder-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [showForm]="showForm()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class FolderEditModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly folder = input.required<FolderModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.folder()));
  protected showForm = signal(true);

  // derived
  protected readonly headerTitle = computed(() => getTitleLabel('folder', this.folder().bkey, this.isReadOnly()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.folder()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: FolderModel): void {
    this.formData.set(formData);
  }
}
