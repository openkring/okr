import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { IconModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';

import { IconEditFormComponent } from '@bk2/icon-ui';

@Component({
  selector: 'bk-icon-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, IconEditFormComponent,
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
          <bk-icon-edit-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenants]="env.tenantId"
            [readOnly]="isReadOnly()"
            [showForm]="showForm()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }
    </ion-content>
  `
})
export class IconEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly env = inject(ENV);

  // inputs
  public icon = input.required<IconModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input<string>('');
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.icon()));

  protected readonly headerTitle = computed(() => getTitleLabel('icon', this.icon()?.bkey, this.isReadOnly()));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.icon()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: IconModel): void {
    this.formData.set(formData);
  }
}
