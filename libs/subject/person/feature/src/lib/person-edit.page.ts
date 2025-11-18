import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, Platform } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { PersonCollection, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared-ui';
import { coerceBoolean, getFullPersonName, hasRole } from '@bk2/shared-util-core';

import { AvatarService } from '@bk2/avatar-data-access';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { MembershipAccordionComponent } from '@bk2/relationship-membership-feature';
import { OwnershipAccordionComponent } from '@bk2/relationship-ownership-feature';
import { PersonalRelAccordionComponent } from '@bk2/relationship-personal-rel-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';
import { WorkrelAccordionComponent } from '@bk2/relationship-workrel-feature';
import { AddressesAccordionComponent } from '@bk2/subject-address-feature';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { PersonFormComponent } from '@bk2/subject-person-ui';
import { convertPersonToForm } from '@bk2/subject-person-util';

import { PersonEditStore } from './person-edit.store';

@Component({
  selector: 'bk-person-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    PersonFormComponent, AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    MembershipAccordionComponent, OwnershipAccordionComponent, ReservationsAccordionComponent,
    PersonalRelAccordionComponent, WorkrelAccordionComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [PersonEditStore],
    styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
    <bk-header [title]="title()" />
    @if(formIsValid() && !isReadOnly()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [readOnly]="isReadOnly()" title="{{ avatarTitle() }}"/>
      @if(person(); as person) {
        <bk-person-form [(vm)]="vm" 
          [currentUser]="currentUser()"
          [priv]="priv()"
          [genders]="genders()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (validChange)="setFormIsValid($event)" />

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="addresses" [multiple]="true">
              <bk-addresses-accordion [parentKey]="person.bkey" parentModelType="person" [addresses]="addresses()" 
                [readOnly]="isReadOnly()" (addressesChanged)="onAddressesChanged()" />
              <bk-membership-accordion [member]="person" [readOnly]="isReadOnly()"/>
              <bk-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" [readOnly]="isReadOnly()" />
              <bk-reservations-accordion [reserver]="person" [defaultResource]="defaultResource()" [readOnly]="isReadOnly()" />
              @if(hasRole('privileged') || hasRole('memberAdmin')) {
                <bk-personal-rel-accordion [personKey]="personKey()" [readOnly]="isReadOnly()" />
                <bk-workrel-accordion [personKey]="personKey()" [readOnly]="isReadOnly()" />
                <bk-comments-accordion [collectionName]="personCollection" [parentKey]="personKey()" [readOnly]="isReadOnly()"/>
                <!-- documents -->
              }
            </ion-accordion-group> 
          </ion-card-content>
        </ion-card>
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
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  protected priv = computed(() => this.personEditStore.privacySettings());
  protected title = computed(() => this.isReadOnly() ? 'Person anzeigen' : 'Person ändern');
  protected currentUser = computed(() => this.personEditStore.currentUser());
  protected person = computed(() => this.personEditStore.person());
  protected defaultResource = computed(() => this.personEditStore.defaultResource());
  protected addresses = computed(() => this.personEditStore.addresses());
  public vm = linkedSignal(() => convertPersonToForm(this.person()));
  protected avatarKey = computed(() => `person.${this.personKey()}`);
  protected avatarTitle = computed(() => getFullPersonName(this.person()?.firstName ?? '', this.person()?.lastName ?? ''));
  protected tags = computed(() => this.personEditStore.getTags());
  protected genders = computed(() => this.personEditStore.appStore.getCategory('gender'));
  protected formIsValid = computed(() => this.personEditStore.formIsValid());

  protected personCollection = PersonCollection;

  constructor() {
    effect(() => {
      this.personEditStore.setPersonKey(this.personKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.setFormIsValid(false);
    await this.personEditStore.save(this.vm());
  }

  public async cancel(): Promise<void> {
    this.setFormIsValid(false);
    this.vm.set(convertPersonToForm(this.person()));  // reset form
  }

  protected setFormIsValid(isValid: boolean): void {
    this.personEditStore.setFormIsValid(isValid);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const _person = this.person();
    if (!_person) return;
    const _file = await readAsFile(photo, this.platform);
    const _avatar = newAvatarModel([this.env.tenantId], 'group', _person.bkey, _file.name);
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
