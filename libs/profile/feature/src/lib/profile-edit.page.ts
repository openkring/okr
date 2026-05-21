import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';

import { AddressesAccordion } from '@bk2/subject-address-feature';
import { AvatarToolbar } from '@bk2/avatar-feature';
import { ProfileDataAccordion, ProfilePrivacyAccordion, ProfileSettingsAccordion } from '@bk2/profile-ui';
import { ProfileStore } from './profile.store';

@Component({
  selector: 'bk-profile-edit-page',
  standalone: true,
  imports: [
    AsyncPipe,
    AvatarToolbar, Header, AddressesAccordion, ProfileDataAccordion,
    ChangeConfirmation, ProfileSettingsAccordion, ProfilePrivacyAccordion,
    IonContent, IonItem, IonAccordionGroup, IonLabel, IonCard, IonCardContent
  ],
  providers: [ProfileStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar
        key="{{ parentKey() }}"
        [title]="avatarTitle()"
        modelType="person"
        subTitle="{{ 'mailto:' + loginEmail() }}"
        [readOnly]="false"
        (imageSelected)="onImageSelected($event)"
      />
      <ion-item lines="none">
        <ion-label><div [innerHTML]="introHtml() | async"></div></ion-label>    
      </ion-item>
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-accordion-group value="addresses" [multiple]="true">
            @if(personFormData(); as personFormData) {
              @if(currentUser(); as currentUser) {
                <bk-profile-data-accordion
                  [formData]="personFormData"
                  (formDataChange)="onPersonChange($event)"
                  [currentUser]="currentUser"
                  [genders]="genders()"
                  [tags]="tags()"
                  [tenantId]="tenantId()"
                  [showForm]="showForm()"
                  [readOnly]="false"
                  [i18n]="store.i18n"
                  (valid)="formValid.set($event)" 
                  (dirty)="formDirty.set($event)"
                />
              }
            }
            <bk-addresses-accordion [parentKey]="parentKey()" description="@profile.addresses.description" [priv]="priv()" [readOnly]="false" />
            @if(userFormData(); as userFormData) {
              <bk-profile-settings-accordion
                [formData]="userFormData"
                (formDataChange)="onUserChange($event)"
                [currentUser]="currentUser()"
                [readOnly]="false"
                [tags]="tags()"
                [tenantId]="tenantId()"
                [showForm]="showForm()"
                [i18n]="store.i18n"
                (valid)="formValid.set($event)"
                (dirty)="formDirty.set($event)"
              />
            }
            @if(userFormData(); as userFormData) {
              <bk-profile-privacy-accordion
                [formData]="userFormData"
                (formDataChange)="onUserChange($event)"
                [currentUser]="currentUser()"
                [showForm]="showForm()"
                [readOnly]="false"
                [tags]="tags()"
                [tenantId]="tenantId()"
                (valid)="formValid.set($event)" 
                (dirty)="formDirty.set($event)"
              />
            }
          </ion-accordion-group>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class ProfileEditPage {
  protected readonly store = inject(ProfileStore);

  // inputs
  // readOnly is always false for profile page as we work with the current user's own profile
  // person is read from currentUser

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.store.i18n.changeConfirmation_ok(),
    cancel: this.store.i18n.changeConfirmation_cancel(),
    confirmation: this.store.i18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));
  protected personFormData = linkedSignal(() => safeStructuredClone(this.currentPerson()));
  protected userFormData = linkedSignal(() => safeStructuredClone(this.currentUser()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(false, this.currentUser()?.bkey));
  protected currentUser = computed(() => this.store.currentUser());
  protected currentPerson = computed(() => this.store.person());
  protected personKey = computed(() => this.currentUser()?.personKey || '');
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected tenantId = computed(() => this.store.tenantId());
  protected loginEmail = computed(() => this.currentUser()?.loginEmail || '');
  protected parentKey = computed(() => `${PersonModelName}.${this.personKey()}`);
  protected avatarTitle = computed(() => this.currentPerson()?.firstName + ' ' + this.currentPerson()?.lastName);
  protected introHtml = computed(async () => this.store.i18n.intro() + ' <a href=mailto:"' + this.store.appStore.appConfig().opEmail + '">Website Admin</a>.');
  protected tags = computed(() => this.store.getTags());
  protected priv = computed(() => this.store.privacySettings());

  constructor() {
    effect(() => {
      this.store.setPersonKey(this.personKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.store.save(this.personFormData(), this.userFormData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.personFormData.set(safeStructuredClone(this.currentPerson()));  // reset
    this.userFormData.set(safeStructuredClone(this.currentUser()));  // reset
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.store.saveAvatar(photo);
  }

  protected onPersonChange(formData: PersonModel): void {
    this.personFormData.set(formData);
  }

  protected onUserChange(formData: UserModel): void {
    this.userFormData.set(formData);
  }
}
