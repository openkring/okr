import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonContent, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, UserCollection } from '@bk2/shared-models';
import { ChangeConfirmationComponent, ChipsComponent, HeaderComponent, UploadService } from '@bk2/shared-ui';
import { debugFormModel, getFullPersonName } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';
import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { CommentsCardComponent } from '@bk2/comment-feature';

import { UserAuthFormComponent, UserDisplayFormComponent, UserModelFormComponent, UserNotificationFormComponent, UserPrivacyFormComponent } from '@bk2/user-ui';
import { convertAuthFormToUser, convertDisplayFormToUser, convertModelFormToUser, convertNotificationFormToUser, convertPrivacyFormToUser, convertUserToAuthForm, convertUserToDisplayForm, convertUserToModelForm, convertUserToNotificationForm, convertUserToPrivacyForm, UserAuthFormModel, UserDisplayFormModel, UserModelFormModel, UserNotificationFormModel, UserPrivacyFormModel } from '@bk2/user-util';
import { UserEditStore } from './user-edit.store';

@Component({
  selector: 'bk-user-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, AvatarToolbarComponent, ChipsComponent, CommentsCardComponent,
    UserModelFormComponent, UserDisplayFormComponent, UserAuthFormComponent, UserPrivacyFormComponent, UserNotificationFormComponent,
    IonContent
  ],
  providers: [UserEditStore],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [showCloseButton]="false" />
    @if(formIsValid()) {
        <bk-change-confirmation (okClicked)="save()" />
      } 
    <ion-content>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [isEditable]="true" title="{{ avatarTitle() }}"/>
      @if(user(); as user) {
        <bk-user-model-form [(vm)]="userModelVm" (validChange)="formIsValid.set($event)" />
        <bk-user-auth-form [(vm)]="userAuthVm" (validChange)="formIsValid.set($event)" />
        <bk-user-display-form [(vm)]="userDisplayVm" (validChange)="formIsValid.set($event)" />
        <bk-user-privacy-form [(vm)]="userPrivacyVm" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
        <bk-user-notification-form [(vm)]="userNotificationVm" (validChange)="formIsValid.set($event)" />
        <bk-chips chipName="tag" [storedChips]="user.tags" [allChips]="userTags()" chipName="tag" (changed)="onTagsChanged($event)" />
      }
      <bk-comments-card [collectionName]="userCollection" [parentKey]="userKey()" />
    </ion-content>
  `
})
export class UserPageComponent{
  private readonly avatarService = inject(AvatarService);
  private readonly userEditStore = inject(UserEditStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  protected userKey = input.required<string>();

  protected readonly user = computed(() => this.userEditStore.user());
  protected readonly headerTitle = computed(() => this.user()?.bkey ? '@user.operation.update.label' : '@user.operation.create.label');
  protected readonly avatarTitle = computed(() => getFullPersonName(this.user().firstName, this.user().lastName));
  protected readonly avatarKey = computed(() => `${ModelType.Person}.${this.user().bkey}`);
  protected readonly userTags = computed(() => this.userEditStore.getTags());
  protected readonly currentUser = computed(() => this.userEditStore.currentUser());

  protected userAuthVm = linkedSignal(() => convertUserToAuthForm(this.user()));
  protected userDisplayVm = linkedSignal(() => convertUserToDisplayForm(this.user()));
  protected userModelVm = linkedSignal(() => convertUserToModelForm(this.user()));
  protected userPrivacyVm = linkedSignal(() => convertUserToPrivacyForm(this.user()));
  protected userNotificationVm = linkedSignal(() => convertUserToNotificationForm(this.user()));
  protected tags = linkedSignal(() => this.user().tags);

  protected formIsValid = signal(false);
  protected userCollection = UserCollection;

  constructor() {
    effect(() => { this.userEditStore.setUserKey(this.userKey()); });
    effect(() => { debugFormModel<UserAuthFormModel>('userAuth', this.userAuthVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserDisplayFormModel>('userDisplay', this.userDisplayVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserModelFormModel>('userModel', this.userModelVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserNotificationFormModel>('userNotification', this.userNotificationVm(), this.currentUser()); });
    effect(() => { debugFormModel<UserPrivacyFormModel>('userPrivacy', this.userPrivacyVm(), this.currentUser()); });
  }

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    this.formIsValid.set(false);
    let _user = convertAuthFormToUser(this.userAuthVm(), this.user());
    _user = convertDisplayFormToUser(this.userDisplayVm(), this.user());
    _user = convertModelFormToUser(this.userModelVm(), this.user());
    _user = convertNotificationFormToUser(this.userNotificationVm(), this.user());
    _user = convertPrivacyFormToUser(this.userPrivacyVm(), this.user());
    this.userEditStore.save(_user);
  }

 /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const _user = this.user();
    if (!_user) return;
    const _file = await readAsFile(photo, this.platform);
    const _avatar = newAvatarModel([this.env.tenantId], ModelType.User, _user.bkey, _file.name);
    const _downloadUrl = await this.uploadService.uploadFile(_file, _avatar.storagePath, '@document.operation.upload.avatar.title')

    if (_downloadUrl) {
      await this.avatarService.updateOrCreate(_avatar);
    }
  }

  protected onTagsChanged(tags: string): void {
    this.tags.set(tags);
    this.formIsValid.set(true);
  }}
