import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonContent, IonItem, IonLabel, Platform } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { I18nService, TranslatePipe } from '@bk2/shared-i18n';
import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared-ui';
import { debugFormModel } from '@bk2/shared-util-core';

import { AddressesAccordionComponent } from '@bk2/subject-address-feature';

import { AvatarService } from '@bk2/avatar-data-access';
import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';

import { ProfileService } from '@bk2/profile-data-access';
import { ProfileDataAccordionComponent, ProfilePrivacyAccordionComponent, ProfileSettingsAccordionComponent } from '@bk2/profile-ui';
import { convertPersonalDataFormToPerson, convertPersonToDataForm, convertPrivacyFormToUser, convertSettingsFormToUser, convertUserToPrivacyForm, convertUserToSettingsForm, PersonalDataFormModel, PrivacyFormModel, SettingsFormModel } from '@bk2/profile-util';

@Component({
  selector: 'bk-profile-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    AvatarToolbarComponent, HeaderComponent, AddressesAccordionComponent, ProfileDataAccordionComponent,
    ChangeConfirmationComponent, ProfileSettingsAccordionComponent, ProfilePrivacyAccordionComponent,
    IonContent, IonItem, IonAccordionGroup, IonLabel
  ],
  template: `
    <bk-header title="{{ '@profile.operation.update.label' | translate | async }}" [showCloseButton]="false" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-avatar-toolbar key="{{ avatarKey() }}" (imageSelected)="onImageSelected($event)" [isEditable]="true" title="{{ title() }}" />
      <ion-item lines="none">
        <ion-label><div [innerHTML]="introHtml() | async"></div></ion-label>    
      </ion-item>
      <ion-accordion-group value="addresses" [multiple]="true">
        <bk-profile-data-accordion [(vm)]="personalData"
          [currentUser]="currentUser()"
          [genders]="genders()"
          (validChange)="formIsValid.set($event)"
        />
        @if(personKey(); as personKey) {
          <bk-addresses-accordion [parentKey]="personKey" [readOnly]="false" parentModelType="person" [addresses]="addresses()" />
        }
        <bk-profile-settings-accordion [(vm)]="settings" [currentUser]="currentUser()" (validChange)="formIsValid.set($event) "/>
        <bk-profile-privacy-accordion [(vm)]="privacy" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
      </ion-accordion-group>
    </ion-content>
  `
})
export class ProfilePageComponent {
  protected readonly appStore = inject(AppStore);
  private readonly uploadService = inject(UploadService);
  private readonly profileService = inject(ProfileService);
  private readonly avatarService = inject(AvatarService);
  private readonly i18nService = inject(I18nService);
  private readonly platform = inject(Platform);

  protected formIsValid = signal(false);

  protected currentUser = computed(() => this.appStore.currentUser());
  protected genders = computed(() => this.appStore.getCategory('gender'));
  protected currentPerson = computed(() => this.appStore.currentPerson());
  protected personKey = computed(() => this.currentPerson()?.bkey);
  protected addresses = computed(() => this.appStore.addresses());

  protected personalData = linkedSignal(() => convertPersonToDataForm(this.currentPerson()));
  protected settings = linkedSignal(() => convertUserToSettingsForm(this.currentUser()));
  protected privacy = linkedSignal(() => convertUserToPrivacyForm(this.currentUser()));
  protected avatarKey = computed(() => 'person.' + this.personKey());
  protected title = computed(() => this.currentPerson()?.firstName + ' ' + this.currentPerson()?.lastName);
  protected introHtml = computed(async () => {
    const intro = await firstValueFrom(this.i18nService.translate('@profile.intro'));
    return intro + ' <a href=mailto:"' + this.appStore.appConfig().opEmail + '">Website Admin</a>.';
  });

  constructor() {
    effect(() => { debugFormModel<PersonalDataFormModel>('personalData', this.personalData(), this.appStore.currentUser()); });
    effect(() => { debugFormModel<SettingsFormModel>('settings', this.settings(), this.appStore.currentUser()); });
    effect(() => { debugFormModel<PrivacyFormModel>('privacy', this.privacy(), this.appStore.currentUser()); });
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const personKey = this.personKey();
    if (!personKey) return;
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([this.appStore.tenantId()], 'person', personKey, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, '@document.operation.upload.avatar.title')

    if (downloadUrl) {
      await this.avatarService.updateOrCreate(avatar);
    }
  }

  public async save(): Promise<void> {
    this.formIsValid.set(false);
    const person = convertPersonalDataFormToPerson(this.personalData(), this.currentPerson());
    let user = convertSettingsFormToUser(this.settings(), this.currentUser());
    user = convertPrivacyFormToUser(this.privacy(), user);
    await this.profileService.update(person, user, this.currentUser());
  }
}
