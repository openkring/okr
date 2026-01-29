import { AsyncPipe } from '@angular/common';
import { ChangeDetectorRef, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, IonItem, IonLabel, ViewWillEnter } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';

import { AddressesAccordionComponent } from '@bk2/subject-address-feature';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';

import { ProfileDataAccordionComponent, ProfilePrivacyAccordionComponent, ProfileSettingsAccordionComponent } from '@bk2/profile-ui';
import { PersonModel, PersonModelName, UserModel } from '@bk2/shared-models';
import { ProfileEditStore } from './profile-edit.store';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-profile-edit-page',
  standalone: true,
  imports: [
    AsyncPipe,
    AvatarToolbarComponent, HeaderComponent, AddressesAccordionComponent, ProfileDataAccordionComponent,
    ChangeConfirmationComponent, ProfileSettingsAccordionComponent, ProfilePrivacyAccordionComponent,
    IonContent, IonItem, IonAccordionGroup, IonLabel, IonCard, IonCardContent
  ],
  providers: [ProfileEditStore],
    styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [showCloseButton]="false" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-avatar-toolbar
        key="{{ parentKey() }}"
        title="{{ avatarTitle() }}"
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
              <bk-profile-data-accordion
                [formData]="personFormData"
                (formDataChange)="onPersonChange($event)"
                [currentUser]="currentUser()"
                [genders]="genders()"
                [tags]="tags()"
                [tenantId]="tenantId()"
                [showForm]="showForm()"
                [readOnly]="false"
                (valid)="formValid.set($event)" 
                (dirty)="formDirty.set($event)"
              />
            }
            <bk-addresses-accordion [parentKey]="parentKey()" description="@profile.addresses.description" [readOnly]="false" />
            @if(userFormData(); as userFormData) {
              <bk-profile-settings-accordion
                [formData]="userFormData"
                (formDataChange)="onUserChange($event)"
                [currentUser]="currentUser()"
                [readOnly]="false"
                [tags]="tags()"
                [tenantId]="tenantId()"
                [showForm]="showForm()"
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
export class ProfileEditPageComponent implements ViewWillEnter {
  private readonly profileEditStore = inject(ProfileEditStore);
  private readonly i18nService = inject(I18nService);
  private cdr = inject(ChangeDetectorRef);

  // inputs
  // readOnly is always false for profile page as we work with the current user's own profile

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected personFormData = linkedSignal(() => {
    const person = this.currentPerson();
    return person ? structuredClone(person) : undefined;
  });
  protected userFormData = linkedSignal(() => {
    const user = this.currentUser();
    return user ? structuredClone(user) : undefined;
  });
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('profile', this.currentUser()?.bkey, false));
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
  protected tags = computed(() => this.profileEditStore.getTags());

  /**
   * Lifecycle hook that is called when the view is about to enter and become the active page.
   * Give some time for the avatar toolbar to initialize before triggering change detection.
   * This prevents a potential race condition that could lead to data not being displayed correctly.
   */
  ionViewWillEnter() {
    this.profileEditStore.setPersonKey(this.personKey());
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.profileEditStore.save(this.personFormData(), this.userFormData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.personFormData.set(structuredClone(this.currentPerson()));  // reset
    this.userFormData.set(structuredClone(this.currentUser()));  // reset
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.profileEditStore.saveAvatar(photo);
  }

  protected onPersonChange(formData: PersonModel): void {
    this.personFormData.set(formData);
  }

  protected onUserChange(formData: UserModel): void {
    this.userFormData.set(formData);
  }
}
