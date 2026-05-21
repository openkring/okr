import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonContent, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { UserModelName } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Chips, Header } from '@bk2/shared-ui';
import { debugFormModel, getFullName, hasRole } from '@bk2/shared-util-core';

import { AvatarService, UploadService } from '@bk2/avatar-data-access';
import { AvatarToolbar } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { CommentsCard } from '@bk2/comment-feature';

import { UserAuthForm, UserDisplayForm, UserModelForm, UserNotificationForm, UserPrivacyForm } from '@bk2/user-ui';
import { convertAuthFormToUser, convertDisplayFormToUser, convertModelFormToUser, convertNotificationFormToUser, convertPrivacyFormToUser, convertUserToAuthForm, convertUserToDisplayForm, convertUserToModelForm, convertUserToNotificationForm, convertUserToPrivacyForm, UserAuthFormModel, UserDisplayFormModel, UserModelFormModel, UserNotificationFormModel, UserPrivacyFormModel } from '@bk2/user-util';
import { UserStore } from './user.store';

@Component({
  selector: 'bk-user-edit-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AvatarToolbar, Chips, CommentsCard,
    UserModelForm, UserDisplayForm, UserAuthForm, UserPrivacyForm, UserNotificationForm,
    IonContent
  ],
  providers: [UserStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
      }
    <ion-content>
      <bk-avatar-toolbar key="{{avatarKey()}}" modelType="person" (imageSelected)="onImageSelected($event)" [readOnly]="readOnly()" [title]="toolbarTitle()"/>
      @if(user(); as user) {
        <bk-user-model-form [formData]="userModelVm()" [readOnly]="readOnly()" (onFormDataChange)="log($event)" />
        <bk-user-auth-form [formData]="userAuthVm()" [allRoles]="allRoles()" [readOnly]="readOnly()" (onFormDataChange)="log($event)" />
        <bk-user-display-form [formData]="userDisplayVm()" [readOnly]="readOnly()" (onFormDataChange)="log($event)" />
        <bk-user-privacy-form [formData]="userPrivacyVm()" [readOnly]="readOnly()" [currentUser]="currentUser()" (onFormDataChange)="log($event)" />
        <bk-user-notification-form [formData]="userNotificationVm()" [readOnly]="readOnly()" (onFormDataChange)="log($event)" />
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onTagsChanged($event)" [readOnly]="readOnly()" [allChips]="allTags()" chipName="tag" />
      }
      <bk-comments-card [parentKey]="parentKey()" />
    </ion-content>
  `
})
export class UserEditPage{
  private readonly avatarService = inject(AvatarService);
  private readonly store = inject(UserStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  // inputs
  protected userKey = input.required<string>();

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
  protected readonly parentKey = computed(() => `${UserModelName}.${this.userKey()}`);
  protected readonly user = computed(() => this.store.user());
  protected readonly avatarKey = computed(() => `person.${this.user().bkey}`);
  protected readonly allTags = computed(() => this.store.getTags());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));
  protected readonly allRoles = computed(() => this.store.appStore.getCategory('roles'));
  protected tags = linkedSignal(() => this.user().tags);
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  constructor() {
    effect(() => { this.store.setUserKey(this.userKey()); });
    effect(() => { debugFormModel<UserAuthFormModel>('userAuth', this.userAuthVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserDisplayFormModel>('userDisplay', this.userDisplayVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserModelFormModel>('userModel', this.userModelVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserNotificationFormModel>('userNotification', this.userNotificationVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserPrivacyFormModel>('userPrivacy', this.userPrivacyVm(), this.currentUser()); });
  }

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    this.formDirty.set(false);
    let user = convertAuthFormToUser(this.userAuthVm(), this.user());
    user = convertDisplayFormToUser(this.userDisplayVm(), this.user());
    user = convertModelFormToUser(this.userModelVm(), this.user());
    user = convertNotificationFormToUser(this.userNotificationVm(), this.user());
    user = convertPrivacyFormToUser(this.userPrivacyVm(), this.user());
    this.store.save(user);
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

  protected log(formData: any): void {
    console.log('UserModelFormData changed:', formData, typeof formData);
  }
}
