import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonAccordionGroup, IonContent, IonItem, IonLabel } from '@ionic/angular/standalone';
import { Photo } from '@capacitor/camera';

import { AvatarToolbarComponent } from '@bk2/avatar/ui';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared/ui';
import { AvatarService } from '@bk2/avatar/data-access';
import { ModelType } from '@bk2/shared/models';
import { ProfileService } from '@bk2/profile/data-access';
import { I18nService, TranslatePipe } from '@bk2/shared/i18n';
import { AddressesAccordionComponent } from '@bk2/address/feature';
import { firstValueFrom } from 'rxjs';
import { convertPersonalDataFormToPerson, convertPersonToDataForm, convertPrivacyFormToUser, convertSettingsFormToUser, convertUserToPrivacyForm, convertUserToSettingsForm, PersonalDataFormModel, PrivacyFormModel, SettingsFormModel } from '@bk2/profile/util';
import { ProfileDataAccordionComponent, ProfilePrivacyAccordionComponent, ProfileSettingsAccordionComponent } from '@bk2/profile/ui';
import { AppStore } from '@bk2/auth/feature';
import { debugFormModel } from '@bk2/shared/util';

@Component({
  selector: 'bk-profile-page',
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
        <bk-profile-data-accordion [(vm)]="personalData" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)"/>
        @if(personKey(); as personKey) {
          <bk-addresses-accordion [parentKey]="personKey" [readOnly]="false" color="light" [parentModelType]="modelType.Person" [addresses]="addresses()" />
        }
        <bk-profile-settings-accordion [(vm)]="settings" [currentUser]="currentUser()" (validChange)="formIsValid.set($event) "/>
        <bk-profile-privacy-accordion [(vm)]="privacy" [currentUser]="currentUser()" (validChange)="formIsValid.set($event)" />
      </ion-accordion-group>
    </ion-content>
  `
})
export class ProfilePageComponent {
  protected readonly appStore = inject(AppStore);
  private readonly avatarService = inject(AvatarService);
  private readonly profileService = inject(ProfileService);
  private readonly i18nService = inject(I18nService);

  protected formIsValid = signal(false);

  protected currentUser = computed(() => this.appStore.currentUser());
  protected currentPerson = computed(() => this.appStore.currentPerson());
  protected personKey = computed(() => this.currentPerson()?.bkey);
  protected addresses = computed(() => this.appStore.addresses());

  protected personalData = linkedSignal(() => convertPersonToDataForm(this.currentPerson()));
  protected settings = linkedSignal(() => convertUserToSettingsForm(this.currentUser()));
  protected privacy = linkedSignal(() => convertUserToPrivacyForm(this.currentUser()));
  protected avatarKey = computed(() => ModelType.Person + '.' + this.personKey());
  protected title = computed(() => this.currentPerson()?.firstName + ' ' + this.currentPerson()?.lastName);
  protected introHtml = computed(async () => {
    const _intro = await firstValueFrom(this.i18nService.translate('@profile.intro'));
    return _intro + ' <a href=mailto:"' + this.appStore.env.operator.email + '">Website Admin</a>.';
  });

  public modelType = ModelType;

  constructor() {
    effect(() => { debugFormModel<PersonalDataFormModel>('personalData', this.personalData(), this.appStore.currentUser()); });
    effect(() => { debugFormModel<SettingsFormModel>('settings', this.settings(), this.appStore.currentUser()); });
    effect(() => { debugFormModel<PrivacyFormModel>('privacy', this.privacy(), this.appStore.currentUser()); });
  }

  public async onImageSelected(photo: Photo): Promise<void> {
    const _personKey = this.personKey();
    if (_personKey !== undefined) {
      await this.avatarService.uploadPhoto(photo, ModelType.Person, _personKey);
    }
  }

  public async save(): Promise<void> {
    this.formIsValid.set(false);
    const _person = convertPersonalDataFormToPerson(this.personalData(), this.currentPerson());
    let _user = convertSettingsFormToUser(this.settings(), this.currentUser());
    _user = convertPrivacyFormToUser(this.privacy(), _user);
    await this.profileService.update(_person, _user);
  }
}
