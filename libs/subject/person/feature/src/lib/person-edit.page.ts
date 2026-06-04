import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ViewWillEnter } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, getFullName, hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { MembershipAccordion } from '@bk2/relationship-membership-feature';
import { OwnershipAccordion } from '@bk2/relationship-ownership-feature';
import { PersonalRelAccordion } from '@bk2/relationship-personal-rel-feature';
import { ReservationsAccordion } from '@bk2/relationship-reservation-feature';
import { WorkrelAccordion } from '@bk2/relationship-workrel-feature';

import { AddressesAccordion } from '@bk2/subject-address-feature';
import { CommentsAccordion } from '@bk2/comment-feature';
import { DocumentsAccordion } from '@bk2/document-feature';
import { AvatarToolbar } from '@bk2/avatar-feature';
import { PersonForm } from '@bk2/subject-person-ui';

import { PersonStore } from './person.store';

@Component({
  selector: 'bk-person-edit-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    PersonForm, AvatarToolbar, AddressesAccordion, CommentsAccordion, DocumentsAccordion,
    MembershipAccordion, OwnershipAccordion, ReservationsAccordion,
    PersonalRelAccordion, WorkrelAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [PersonStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">

      <bk-avatar-toolbar 
        key="{{parentKey()}}" 
        [title]="toolbarTitle()" 
        modelType="person" 
        [readOnly]="isReadOnly()" 
        (imageSelected)="onImageSelected($event)"
      />

      @if(formData(); as formData) {
        <bk-person-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n"
          [currentUser]="currentUser()"
          [priv]="priv()"
          [genders]="genders()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(person(); as person) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="addresses" [multiple]="true">
              <bk-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
              <bk-membership-accordion [member]="person" [readOnly]="isReadOnly()"/>
              <bk-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" [readOnly]="hideAddButton()" />
              <bk-reservations-accordion [listId]="listId()" [readOnly]="hideAddButton()" />
              @if(hasRole('privileged') || hasRole('memberAdmin')) {
                <bk-personal-rel-accordion [person]="person" [readOnly]="isReadOnly()" />
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
export class PersonEditPage implements ViewWillEnter   {
  protected readonly store = inject(PersonStore);

  // inputs
  public personKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.person()));
  protected showForm = signal(true);

  // derived signals
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.person()?.bkey ?? ''));
  protected toolbarTitle = computed(() => getFullName(this.person()?.firstName, this.person()?.lastName, this.currentUser()?.nameDisplay));
  protected parentKey = computed(() => PersonModelName + '.' + this.personKey());
  protected priv = computed(() => this.store.privacySettings());
  protected currentUser = computed(() => this.store.currentUser());
  protected person = computed(() => this.store.person());
  protected defaultResource = computed(() => this.store.defaultResource());
  protected tags = computed(() => this.store.getTags());
  protected tenantId = computed(() => this.store.tenantId());
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected listId = computed(() => 'p_' + this.store.person()?.bkey);
  protected hideAddButton = computed(() => {
    if (this.hasRole('resourceAdmin')) return false;
    return this.isReadOnly();
  });

  /**
   * Lifecycle hook that is called when the view is about to enter and become the active page.
   */
  ionViewWillEnter() {
    this.store.setPersonKey(this.personKey());
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const person = this.formData();
    if (!person) return;
    await this.store.save(person);
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    const person = this.person();
    if (person) {
      this.formData.set(safeStructuredClone(person));  // reset the form
    }
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => {
      this.showForm.set(true);
    }, 0);
  }

  protected onFormDataChange(formData: PersonModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.store.saveAvatar(photo, this.personKey());
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.store.i18n.view();
    }
    if (key.length > 0) {
      return this.store.i18n.update();
    } else {
      return this.store.i18n.create();
    }
  }
}
