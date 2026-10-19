import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonContent, IonLabel, IonSegment, IonSegmentButton, ModalController, Platform } from '@ionic/angular';

import { PersonModel, UserModel, UserModelName } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Chips, Header } from '@okr/shared-ui';
import { getFullName } from '@okr/shared-util-core';
import { mirrorPrivacyUsageToPerson } from '@okr/subject-person-util';

import { AvatarService, UploadService } from '@okr/avatar-data-access';
import { AvatarToolbar } from '@okr/avatar-feature';
import { newAvatarModel, readAsFile } from '@okr/avatar-util';
import { CommentsCard } from '@okr/comment-feature';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';

import { UserAuthForm, UserDisplayForm, UserModelForm, UserNotificationForm, UserPrivacyForm } from '@okr/user-ui';
import { convertFormsToUser, convertUserToAuthForm, convertUserToDisplayForm, convertUserToModelForm, convertUserToNotificationForm, convertUserToPrivacyForm, USER_I18N_KEYS, UserAuthFormModel, UserDisplayFormModel, UserI18n, UserModelFormModel, UserNotificationFormModel, UserPrivacyFormModel } from '@okr/user-util';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-user-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, AvatarToolbar, Chips, CommentsCard,
    UserModelForm, UserDisplayForm, UserAuthForm, UserPrivacyForm, UserNotificationForm,
    IonContent, IonSegment, IonSegmentButton, IonLabel
  ],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-avatar-toolbar key="{{avatarKey()}}" modelType="person" (imageSelected)="onImageSelected($event)" [readOnly]="readOnly()" [title]="toolbarTitle()"/>
      <!-- the segment only picks which forms are shown; @switch destroys and re-creates them on every
           switch, so their state lives in the modal's *Vm signals (seeded from those on re-create) and
           one save covers all segments -->
      <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
        <ion-segment-button value="profile"><ion-label>{{ i18n.segment_profile() }}</ion-label></ion-segment-button>
        <ion-segment-button value="roles"><ion-label>{{ i18n.segment_roles() }}</ion-label></ion-segment-button>
        <ion-segment-button value="settings"><ion-label>{{ i18n.segment_settings() }}</ion-label></ion-segment-button>
      </ion-segment>
      @if(user(); as user) {
        @switch (segment()) {
          @case ('roles') {
            <okr-user-auth-form [i18n]="i18n" [formData]="userAuthVm()" [allRoles]="allRoles()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('auth', $event)" />
          }
          @case ('settings') {
            <okr-user-display-form [i18n]="i18n" [formData]="userDisplayVm()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('display', $event)" />
            <okr-user-privacy-form [i18n]="i18n" [formData]="userPrivacyVm()" [readOnly]="readOnly()" [currentUser]="currentUser()" (formDataChange)="onFormDataChange('privacy', $event)" />
            <okr-user-notification-form [i18n]="i18n" [formData]="userNotificationVm()" [readOnly]="readOnly()" (formDataChange)="onFormDataChange('notification', $event)" />
          }
          @default {
            <okr-user-model-form
                [i18n]="i18n"
                [formData]="userModelVm()"
                (formDataChange)="onFormDataChange('model', $event)"
                [readOnly]="readOnly()"
                (dirty)="formDirty.set($event)"
                (valid)="formValid.set($event)"
            />
            <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onTagsChanged($event)" [readOnly]="readOnly()" [allChips]="allTags()" chipName="tag" />
          }
        }
      }
      <okr-comments-card [parentKey]="parentKey()" />
    </ion-content>
  `
})
export class UserEditModal {
  private readonly modalController = inject(ModalController);
  private readonly avatarService = inject(AvatarService);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(USER_I18N_KEYS) as UserI18n;

  // inputs
  protected user = input.required<UserModel>();
  // the linked person carries the authoritative usage* privacy preferences (tenant-readable
  // source for getPersonPrivacySettings); the user keeps a legacy copy only.
  protected person = input<PersonModel | undefined>();
  public readOnly = input<boolean>(true);

  // formData
  protected userAuthVm = linkedSignal(() => convertUserToAuthForm(this.user()));
  protected userDisplayVm = linkedSignal(() => convertUserToDisplayForm(this.user()));
  protected userModelVm = linkedSignal(() => convertUserToModelForm(this.user()));
  protected userPrivacyVm = linkedSignal(() => this.buildPrivacyVm());
  protected userNotificationVm = linkedSignal(() => convertUserToNotificationForm(this.user()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected segment = signal<'profile' | 'roles' | 'settings'>('profile');

  // derived
  protected readonly headerTitle = computed(() => {
    if (this.readOnly()) return this.i18n.view();
    const key = this.user()?.okey;
    return (key && key.length > 0) ? this.i18n.update() : this.i18n.create();
  });
  protected readonly toolbarTitle = computed(() => getFullName(this.user().firstName, this.user().lastName, this.user().nameDisplay));
  protected readonly parentKey = computed(() => `${UserModelName}.${this.user().okey}`);
  protected readonly avatarKey = computed(() => `person.${this.user().personKey}`);
  protected readonly allTags = computed(() => this.appStore.getTags('user'));
  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly allRoles = computed(() => this.appStore.getCategory('roles'));
  protected tags = linkedSignal(() => this.user().tags);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  protected async save(): Promise<void> {
    const user = convertFormsToUser(this.userAuthVm(), this.userDisplayVm(), this.userModelVm(), this.userNotificationVm(), this.userPrivacyVm(), this.user());
    // Write the usage* privacy preferences directly onto the linked person (the authoritative
    // source). The user keeps a legacy copy via convertFormsToUser.
    const person = this.person();
    const updatedPerson = person ? mirrorPrivacyUsageToPerson(person, this.userPrivacyVm()) : undefined;
    await dismissOverlay(this.modalController, { user, person: updatedPerson }, 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    // reset the forms
    this.userModelVm.set(convertUserToModelForm(this.user()));
    this.userDisplayVm.set(convertUserToDisplayForm(this.user()));
    this.userNotificationVm.set(convertUserToNotificationForm(this.user()));
    this.userPrivacyVm.set(this.buildPrivacyVm());
    this.userAuthVm.set(convertUserToAuthForm(this.user()));
  }

  /**
   * Build the privacy sub-form: usage* preferences come from the linked person (authoritative,
   * with the user's values as fallback during the transition), srvEmail stays on the user.
   */
  private buildPrivacyVm(): UserPrivacyFormModel {
    const vm = convertUserToPrivacyForm(this.user());
    const person = this.person();
    if (!person) return vm;
    return {
      ...vm,
      usageImages:        person.usageImages        ?? vm.usageImages,
      usageDateOfBirth:   person.usageDateOfBirth    ?? vm.usageDateOfBirth,
      usagePostalAddress: person.usagePostalAddress  ?? vm.usagePostalAddress,
      usageEmail:         person.usageEmail          ?? vm.usageEmail,
      usagePhone:         person.usagePhone          ?? vm.usagePhone,
      usageName:          person.usageName           ?? vm.usageName,
    };
  }

  public async onImageSelected(photo: Photo): Promise<void> {
    const user = this.user();
    if (!user) return;
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([this.appStore.tenantId()], 'user', user.okey, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, this.i18n.upload_avatar());

    if (downloadUrl) {
      await this.avatarService.updateOrCreate(avatar);
    }
  }

  protected onSegmentChange(value: unknown): void {
    if (value === 'profile' || value === 'roles' || value === 'settings') this.segment.set(value);
  }

  protected onTagsChanged(tags: string): void {
    this.formDirty.set(true);
    this.tags.set(tags);
  }

  protected onFormDataChange(formType: string, formData: UserModelFormModel | UserAuthFormModel | UserDisplayFormModel | UserPrivacyFormModel | UserNotificationFormModel): void {
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
