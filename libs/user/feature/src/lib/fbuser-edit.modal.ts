import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { IonContent, ModalController } from "@ionic/angular";

import { FirebaseUserModel, UserModel } from "@okr/shared-models";
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from "@okr/shared-ui";
import { hasRole, removeUndefinedFields } from "@okr/shared-util-core";

import { FbuserForm } from "@okr/user-ui";
import { dismissOverlay } from '@okr/shared-util-angular';
import { I18nService } from "@okr/shared-i18n";
import { USER_I18N_KEYS, UserI18n } from "@okr/user-util";

@Component({
  selector: 'okr-fbuser-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, FbuserForm,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.fbuser_title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
      } 
    <ion-content>
      <okr-fbuser-form
        [i18n]="i18n"
        [formData]="formData()"
        (formDataChange)="onFormDataChange($event)"
        [currentUser]="currentUser()"
        [readOnly]="readOnly()"
        (dirty)="formDirty.set($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class FbuserEditModal {
  private readonly modalController = inject(ModalController);
  // the i18n only — not the UserStore, whose three callables would load again for every modal
  protected readonly i18n = inject(I18nService).translateAll(USER_I18N_KEYS) as UserI18n;

  // inputs
  public fbuser = input.required<FirebaseUserModel>();
  public currentUser = input.required<UserModel | undefined>();
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => Object.assign(new FirebaseUserModel(), removeUndefinedFields(this.fbuser() as unknown as Record<string, unknown>)));

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await dismissOverlay(this.modalController, this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(this.fbuser());  // reset the form
  }

  protected onFormDataChange(formData: FirebaseUserModel): void {
    this.formData.set(formData);
  }
}
