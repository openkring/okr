import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonItem, IonLabel } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { I18nService, TranslatePipe } from '@bk2/shared-i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { AddressesAccordionComponent } from '@bk2/subject-address-feature';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';

import { ProfileDataAccordionComponent, ProfilePrivacyAccordionComponent, ProfileSettingsAccordionComponent } from '@bk2/profile-ui';
import { convertPersonToDataForm, convertUserToPrivacyForm, convertUserToSettingsForm, PersonalDataFormModel, PrivacyFormModel, SettingsFormModel } from '@bk2/profile-util';
import { PersonModelName } from '@bk2/shared-models';
import { ProfileEditStore } from './profile-edit.store';

@Component({
  selector: 'bk-profile-edit-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    AvatarToolbarComponent, HeaderComponent, AddressesAccordionComponent, ProfileDataAccordionComponent,
    ChangeConfirmationComponent, ProfileSettingsAccordionComponent, ProfilePrivacyAccordionComponent,
    IonContent, IonItem, IonAccordionGroup, IonLabel, IonCard, IonCardContent
  ],
  providers: [ProfileEditStore],
    styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
    <bk-header title="{{ '@profile.operation.update.label' | translate | async }}" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar
        key="{{ parentKey() }}"
        title="{{ avatarTitle() }}"
        subTitle="{{ loginEmail() }}"
        [readOnly]="false"
        (imageSelected)="onImageSelected($event)"
      />
      <ion-item lines="none">
        <ion-label><div [innerHTML]="introHtml() | async"></div></ion-label>    
      </ion-item>
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-accordion-group value="addresses" [multiple]="true">
            @if(personalData(); as personalData) {
              <bk-profile-data-accordion
                [formData]="personalData"
                [currentUser]="currentUser()"
                [genders]="genders()"
                [readOnly]="false"
                (valid)="formValid.set($event)" 
                (dirty)="formDirty.set($event)"
                (formDataChange)="onPersonalChange($event)"
              />
            }
            <bk-addresses-accordion [parentKey]="parentKey()" description="@profile.addresses.description" [readOnly]="false" />
            @if(settingsFormData(); as settingsFormData) {
              <bk-profile-settings-accordion
                [formData]="settingsFormData"
                [currentUser]="currentUser()"
                [readOnly]="false"
                (valid)="formValid.set($event)" 
                (dirty)="formDirty.set($event)"
                (formDataChange)="onSettingsChange($event)"
              />
            }
            @if(privacyFormData(); as privacyFormData) {
              <bk-profile-privacy-accordion
                [formData]="privacyFormData"
                [currentUser]="currentUser()"
                [readOnly]="false"
                (valid)="formValid.set($event)" 
                (dirty)="formDirty.set($event)"
                (formDataChange)="onPrivacyChange($event)"
              />
            }
          </ion-accordion-group>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class ProfileEditPageComponent {
  private readonly profileEditStore = inject(ProfileEditStore);
  private readonly i18nService = inject(I18nService);

  // inputs

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected personalData = linkedSignal<PersonalDataFormModel | undefined>(() => convertPersonToDataForm(this.currentPerson())); 
  protected settingsFormData = linkedSignal<SettingsFormModel | undefined>(() => convertUserToSettingsForm(this.currentUser())); 
  protected privacyFormData = linkedSignal<PrivacyFormModel | undefined>(() => convertUserToPrivacyForm(this.currentUser())); 
  // readOnly is always false for profile page as we work with the current user's own profile

  // derived signals
  protected currentUser = computed(() => this.profileEditStore.currentUser());
  protected currentPerson = computed(() => this.profileEditStore.person());
  protected personKey = computed(() => this.currentUser()?.personKey || '');
  protected genders = computed(() => this.profileEditStore.appStore.getCategory('gender'));
  protected tenantId = computed(() => this.profileEditStore.tenantId());
  protected loginEmail = computed(() => this.currentUser()?.loginEmail || '');

  protected parentKey = computed(() => `${PersonModelName}.${this.personKey()}`);
  protected avatarTitle = computed(() => this.currentPerson()?.firstName + ' ' + this.currentPerson()?.lastName);
  protected introHtml = computed(async () => {
    const intro = await firstValueFrom(this.i18nService.translate('@profile.intro'));
    return intro + ' <a href=mailto:"' + this.profileEditStore.appStore.appConfig().opEmail + '">Website Admin</a>.';
  });

  constructor() {
    effect(() => {
      const user = this.currentUser();
      if (user) {
        this.profileEditStore.setPersonKey(user.personKey);
      }
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.profileEditStore.save(this.personalData(), this.settingsFormData(), this.privacyFormData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.personalData.set(convertPersonToDataForm(this.currentPerson()));  // reset
    this.settingsFormData.set(convertUserToSettingsForm(this.currentUser()));  // reset
    this.privacyFormData.set(convertUserToPrivacyForm(this.currentUser()));  // reset
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.profileEditStore.saveAvatar(photo);
  }

  protected onPersonalChange(formData: PersonalDataFormModel): void {
    this.personalData.set(formData);
  }

  protected onSettingsChange(formData: SettingsFormModel): void {
    this.settingsFormData.set(formData);
  }

  protected onPrivacyChange(formData: PrivacyFormModel): void {
    this.privacyFormData.set(formData);
  }
}
