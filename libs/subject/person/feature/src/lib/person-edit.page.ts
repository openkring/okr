import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { PersonModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, getFullName, hasRole } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';
import { MembershipAccordionComponent } from '@bk2/relationship-membership-feature';
import { OwnershipAccordionComponent } from '@bk2/relationship-ownership-feature';
import { PersonalRelAccordionComponent } from '@bk2/relationship-personal-rel-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';
import { WorkrelAccordionComponent } from '@bk2/relationship-workrel-feature';
import { AddressesAccordionComponent } from '@bk2/subject-address-feature';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { PersonFormComponent } from '@bk2/subject-person-ui';
import { convertPersonToForm, PersonFormModel } from '@bk2/subject-person-util';

import { PersonEditStore } from './person-edit.store';
import { getTitleLabel } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-person-edit-page',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent,
    PersonFormComponent, AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent, DocumentsAccordionComponent,
    MembershipAccordionComponent, OwnershipAccordionComponent, ReservationsAccordionComponent,
    PersonalRelAccordionComponent, WorkrelAccordionComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [PersonEditStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar key="{{parentKey()}}" title="{{ toolbarTitle() }}" [readOnly]="isReadOnly()" (imageSelected)="onImageSelected($event)"/>

      @if(formData(); as formData) {
        <bk-person-form
          [formData]="formData" 
          [currentUser]="currentUser()"
          [priv]="priv()"
          [genders]="genders()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      }

      @if(person(); as person) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="addresses" [multiple]="true">
              <bk-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-membership-accordion [member]="person" [readOnly]="isReadOnly()"/>
              <bk-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" [readOnly]="isReadOnly()" />
              <bk-reservations-accordion [reserver]="person" [resource]="defaultResource()" [readOnly]="isReadOnly()" />
              @if(hasRole('privileged') || hasRole('memberAdmin')) {
                <bk-personal-rel-accordion [personKey]="personKey()" [readOnly]="isReadOnly()" />
                <bk-workrel-accordion [personKey]="personKey()" [readOnly]="isReadOnly()" />
                <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
              }
            </ion-accordion-group> 
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class PersonEditPageComponent {
  protected readonly personEditStore = inject(PersonEditStore);

  // inputs
  public personKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertPersonToForm(this.person()));

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('subject.person', this.person()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => getFullName(this.person()?.firstName, this.person()?.lastName, this.currentUser()?.nameDisplay));
  protected readonly parentKey = computed(() => `${PersonModelName}.${this.personKey()}`);
  protected priv = computed(() => this.personEditStore.privacySettings());
  protected currentUser = computed(() => this.personEditStore.currentUser());
  protected person = computed(() => this.personEditStore.person());
  protected defaultResource = computed(() => this.personEditStore.defaultResource());
  protected tags = computed(() => this.personEditStore.getTags());
  protected genders = computed(() => this.personEditStore.appStore.getCategory('gender'));

  constructor() {
    effect(() => {
      this.personEditStore.setPersonKey(this.personKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.personEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertPersonToForm(this.person()));  // reset the form
  }

  protected onFormDataChange(formData: PersonFormModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.personEditStore.saveAvatar(photo);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
