import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonContent, ModalController, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { UserModel, UserModelName } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Chips, Header } from '@bk2/shared-ui';
import { getFullName } from '@bk2/shared-util-core';

import { AvatarService, UploadService } from '@bk2/avatar-data-access';
import { AvatarToolbar } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { CommentsCard } from '@bk2/comment-feature';

import { UserAuthForm, UserDisplayForm, UserModelForm, UserNotificationForm, UserPrivacyForm } from '@bk2/user-ui';
import { convertFormsToUser, convertUserToAuthForm, convertUserToDisplayForm, convertUserToModelForm, convertUserToNotificationForm, convertUserToPrivacyForm, UserAuthFormModel, UserDisplayFormModel, UserModelFormModel, UserNotificationFormModel, UserPrivacyFormModel } from '@bk2/user-util';
import { UserStore } from './user.store';

@Component({
  selector: 'bk-user-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AvatarToolbar, Chips, CommentsCard,
    UserModelForm, UserDisplayForm, UserAuthForm, UserPrivacyForm, UserNotificationForm,
    IonContent
  ],
  providers: [UserStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar key="{{avatarKey()}}" modelType="person" (imageSelected)="onImageSelected($event)" [readOnly]="readOnly()" [title]="toolbarTitle()"/>
      @if(user(); as user) {
        <bk-user-model-form
            [i18n]="store.i18n"
            [formData]="userModelVm()"
            (formDataChange)="onFormDataChange('model', $event)"
            [readOnly]="readOnly()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
        />
        <bk-user-auth-form [i18n]="store.i18n" [formData]="userAuthVm()" [allRoles]="allRoles()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('auth', $event)" />
        <bk-user-display-form [i18n]="store.i18n" [formData]="userDisplayVm()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('display', $event)" />
        <bk-user-privacy-form [i18n]="store.i18n" [formData]="userPrivacyVm()" [readOnly]="readOnly()" [currentUser]="currentUser()" (formDataChange)="onFormDataChange('privacy', $event)" />
        <bk-user-notification-form [i18n]="store.i18n" [formData]="userNotificationVm()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('notification', $event)" />
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onTagsChanged($event)" [readOnly]="readOnly()" [allChips]="allTags()" chipName="tag" />
      }
      <bk-comments-card [parentKey]="parentKey()" />
    </ion-content>
  `
})
export class UserEditModal {
  private modalController = inject(ModalController);
  private readonly avatarService = inject(AvatarService);
  protected readonly store = inject(UserStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  // inputs
  protected user = input.required<UserModel>();
  public readOnly = input<boolean>(true);

  // formData
  protected userAuthVm = linkedSignal(() => convertUserToAuthForm(this.user()));
  protected userDisplayVm = linkedSignal(() => convertUserToDisplayForm(this.user()));
  protected userModelVm = linkedSignal(() => convertUserToModelForm(this.user()));
  protected userPrivacyVm = linkedSignal(() => convertUserToPrivacyForm(this.user()));
  protected userNotificationVm = linkedSignal(() => convertUserToNotificationForm(this.user()));

   // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.readOnly(), this.user()?.bkey));
  protected readonly toolbarTitle = computed(() => getFullName(this.user().firstName, this.user().lastName, this.user().nameDisplay));
  protected readonly parentKey = computed(() => `${UserModelName}.${this.user().bkey}`);
  protected readonly avatarKey = computed(() => `person.${this.user().personKey}`);
  protected readonly allTags = computed(() => this.store.getTags());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly allRoles = computed(() => this.store.appStore.getCategory('roles'));
  protected tags = linkedSignal(() => this.user().tags);
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    const user = convertFormsToUser(this.userAuthVm(), this.userDisplayVm(), this.userModelVm(), this.userNotificationVm(), this.userPrivacyVm(), this.user());
    await this.modalController.dismiss(user, 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    // reset the forms
    this.userModelVm.set(convertUserToModelForm(this.user()));
    this.userDisplayVm.set(convertUserToDisplayForm(this.user()));
    this.userNotificationVm.set(convertUserToNotificationForm(this.user()));
    this.userPrivacyVm.set(convertUserToPrivacyForm(this.user()));
    this.userAuthVm.set(convertUserToAuthForm(this.user()));
  }

 /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const user = this.user();
    if (!user) return;
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([this.env.tenantId], 'user', user.bkey, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, this.store.i18n.avatar_upload())

    if (downloadUrl) {
      await this.avatarService.updateOrCreate(avatar);
    }
  }

  protected onTagsChanged(tags: string): void {
    this.formDirty.set(true);
    this.tags.set(tags);
  }

  protected onFormDataChange(formType: string, formData: any): void {
    this.formDirty.set(true);
    switch(formType) {
        case 'model': 
            this.userModelVm.set(formData as UserModelFormModel);
            break;
        case 'auth':
            this.userAuthVm.set(formData as UserAuthFormModel);
            break;
        case 'display':
            this.userDisplayVm.set(formData as UserDisplayFormModel);
            break;
        case 'privacy':
            this.userPrivacyVm.set(formData as UserPrivacyFormModel);
            break;
        case 'notification':
            this.userNotificationVm.set(formData as UserNotificationFormModel);
            break;
    }
  }
}
