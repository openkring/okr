import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';
import { PersonModelName, UserModel } from '@okr/shared-models';
import { Languages } from '@okr/shared-categories';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { AvatarToolbar } from '@okr/avatar-feature';
import { PersonFormModel } from '@okr/subject-person-util';
import { ProfileDataAccordion, ProfilePrivacyAccordion, ProfileSettingsAccordion } from '@okr/profile-ui';
import { ProfileStore } from './profile.store';
import { EmailSignatureAccordion } from './email-signature.accordion';

@Component({
  selector: 'okr-profile-edit-page',
  standalone: true,
  imports: [
    AsyncPipe,
    AvatarToolbar, Header, AddressesAccordion, ProfileDataAccordion,
    ChangeConfirmation, ProfileSettingsAccordion, ProfilePrivacyAccordion, EmailSignatureAccordion,
    IonContent, IonItem, IonAccordionGroup, IonLabel, IonCard, IonCardContent
  ],
  providers: [ProfileStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <okr-avatar-toolbar
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
                <okr-profile-data-accordion
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
            <okr-addresses-accordion [parentKey]="parentKey()" description="@profile.addresses.description" [priv]="priv()" [readOnly]="false" />
            @if(userFormData(); as userFormData) {
              <okr-profile-settings-accordion
                [formData]="userFormData"
                (formDataChange)="onUserChange($event)"
                [currentUser]="currentUser()"
                [readOnly]="false"
                [tags]="tags()"
                [tenantId]="tenantId()"
                [languages]="availableLanguages()"
                [showForm]="showForm()"
                [i18n]="store.i18n"
                (valid)="formValid.set($event)"
                (dirty)="formDirty.set($event)"
              />
            }
            @if(userFormData(); as userFormData) {
              @if(personFormData(); as personFormData) {
                <okr-profile-privacy-accordion
                  [formData]="userFormData"
                  (formDataChange)="onUserChange($event)"
                  [personFormData]="personFormData"
                  (personFormDataChange)="onPersonChange($event)"
                  [currentUser]="currentUser()"
                  [showForm]="showForm()"
                  [readOnly]="false"
                  [tags]="tags()"
                  [tenantId]="tenantId()"
                  [i18n]="store.i18n"
                  (valid)="formValid.set($event)"
                  (dirty)="formDirty.set($event)"
                />
              }
            }
            <okr-email-signature-accordion [i18n]="store.i18n" />
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
  // seeded once by the constructor effect, and re-seeded explicitly by cancel(). These must NOT be
  // linkedSignals: currentPerson()/currentUser() are derived from live Firestore streams, so every
  // re-emission would hand back a new object reference (or transiently undefined while the resource
  // reloads) and silently discard whatever the user has edited so far.
  protected personFormData = signal<PersonFormModel | undefined>(undefined);
  protected userFormData = signal<UserModel | undefined>(undefined);
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.store.getTitleLabel(false, this.currentUser()?.okey));
  protected currentUser = computed(() => this.store.currentUser());
  // person + vault ssn/dob (spec 1.19 Phase 4) — undefined until both are loaded
  protected currentPerson = computed(() => this.store.personForm());
  protected personKey = computed(() => this.currentUser()?.personKey || '');
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected tenantId = computed(() => this.store.tenantId());
  protected availableLanguages = computed(() =>
    Languages.filter((l) => !!l.abbreviation && this.store.appStore.enabledLanguageCodes().includes(l.abbreviation)));
  protected loginEmail = computed(() => this.currentUser()?.loginEmail || '');
  protected parentKey = computed(() => `${PersonModelName}.${this.personKey()}`);
  protected avatarTitle = computed(() => this.currentPerson()?.firstName + ' ' + this.currentPerson()?.lastName);
  protected introHtml = computed(async () => this.store.i18n.intro() + ' <a href=mailto:"' + this.store.appStore.appConfig().opEmail + '">Website Admin</a>.');
  protected tags = computed(() => this.store.getTags());
  protected priv = computed(() => this.store.privacySettings());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  constructor() {
    effect(() => {
      this.store.setPersonKey(this.personKey());
    });
    effect(() => {
      const person = this.currentPerson();
      const user = this.currentUser();
      if (!person || !user) return;                                     // still loading -> wait
      if (untracked(this.personFormData) || untracked(this.userFormData)) return;  // already seeded
      this.seedFormData(person, user);
    });
  }

  private seedFormData(person: PersonFormModel | undefined, user: UserModel | undefined): void {
    this.personFormData.set(safeStructuredClone(person));
    this.userFormData.set(safeStructuredClone(user));
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.store.save(this.personFormData(), this.userFormData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.seedFormData(this.currentPerson(), this.currentUser());  // reset to the persisted values
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

  protected onPersonChange(formData: PersonFormModel): void {
    this.personFormData.set(formData);
  }

  protected onUserChange(formData: UserModel): void {
    this.userFormData.set(formData);
  }
}
