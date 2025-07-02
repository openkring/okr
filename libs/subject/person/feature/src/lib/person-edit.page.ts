import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, Platform } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { Photo } from '@capacitor/camera';

import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ENV } from '@bk2/shared/config';
import { ModelType, PersonCollection, RoleName } from '@bk2/shared/models';
import { getFullPersonName, hasRole } from '@bk2/shared/util-core';

import { AvatarService } from '@bk2/avatar/data-access';

import { AddressesAccordionComponent } from '@bk2/address/feature';
import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { MembershipAccordionComponent } from '@bk2/membership/feature';
import { OwnershipAccordionComponent } from '@bk2/ownership/feature';
import { ReservationsAccordionComponent } from '@bk2/reservation/feature';
import { PersonalRelAccordionComponent } from '@bk2/personal-rel/feature';
import { WorkingRelAccordionComponent } from '@bk2/working-rel/feature';

import { convertPersonToForm } from '@bk2/person/util';
import { PersonFormComponent } from '@bk2/person/ui';
import { PersonEditStore } from './person-edit.store';
import { newAvatarModel, readAsFile } from '@bk2/avatar/util';
import { AvatarToolbarComponent } from '@bk2/avatar/feature';

@Component({
  selector: 'bk-person-edit-page',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    PersonFormComponent, AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    MembershipAccordionComponent, OwnershipAccordionComponent, ReservationsAccordionComponent,
    PersonalRelAccordionComponent, WorkingRelAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  providers: [PersonEditStore],
  template: `
    <bk-header title="{{ '@subject.person.operation.update.label' | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [isEditable]="hasRole('memberAdmin')" title="{{ title() }}"/>
      @if(person(); as person) {
        <bk-person-form [(vm)]="vm" 
          [currentUser]="currentUser()"
          [priv]="priv()"
          [personTags]="personTags()"
          (validChange)="formIsValid.set($event)" />

        <ion-accordion-group value="addresses" [multiple]="true">
          <bk-addresses-accordion [parentKey]="personKey()" [readOnly]="false" [parentModelType]="modelType.Person" [addresses]="addresses()" 
            [readOnly]="!hasRole('memberAdmin')" (addressesChanged)="onAddressesChanged()" />
          <bk-membership-accordion [member]="person" />
          <bk-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" />
          <bk-reservations-accordion [reserver]="person" [defaultResource]="defaultResource()" />
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <bk-personal-rel-accordion [personKey]="personKey()" />
            <bk-working-rel-accordion [personKey]="personKey()" />
          }
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
              <bk-comments-accordion [collectionName]="personCollection" [parentKey]="personKey()" />
          }
        </ion-accordion-group> 
      }
    </ion-content>
  `
})
export class PersonEditPageComponent {
  private readonly avatarService = inject(AvatarService);
  private readonly personEditStore = inject(PersonEditStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  public personKey = input.required<string>();

  protected priv = computed(() => this.personEditStore.privacySettings());
  protected currentUser = computed(() => this.personEditStore.currentUser());
  protected person = computed(() => this.personEditStore.person());
  protected defaultResource = computed(() => this.personEditStore.defaultResource());
  protected addresses = computed(() => this.personEditStore.addresses());
  public vm = linkedSignal(() => convertPersonToForm(this.person()));
  protected avatarKey = computed(() => `${ModelType.Person}.${this.personKey()}`);
  protected title = computed(() => getFullPersonName(this.person()?.firstName ?? '', this.person()?.lastName ?? ''));
  protected personTags = computed(() => this.personEditStore.getTags());

  protected formIsValid = signal(false);
  protected modelType = ModelType;
  protected personCollection = PersonCollection;

  constructor() {
    effect(() => {
      this.personEditStore.setPersonKey(this.personKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.personEditStore.save(this.vm());
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const _person = this.person();
    if (!_person) return;
    const _file = await readAsFile(photo, this.platform);
    const _avatar = newAvatarModel([this.env.tenantId], ModelType.Group, _person.bkey, _file.name);
    const _downloadUrl = await this.uploadService.uploadFile(_file, _avatar.storagePath, '@document.operation.upload.avatar.title')

    if (_downloadUrl) {
      await this.avatarService.updateOrCreate(_avatar);
    }
  }

  protected onAddressesChanged(): void {
    this.personEditStore.reloadAddresses();
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
