import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ViewWillEnter } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, RoleName } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, getFullName, hasRole, safeStructuredClone } from '@okr/shared-util-core';

import { MembershipAccordion } from '@okr/relationship-membership-feature';
import { OwnershipAccordion } from '@okr/relationship-ownership-feature';
import { PersonalRelAccordion } from '@okr/relationship-personal-rel-feature';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';
import { WorkrelAccordion } from '@okr/relationship-workrel-feature';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { DocumentsAccordion } from '@okr/document-feature';
import { AvatarToolbar } from '@okr/avatar-feature';
import { PersonForm } from '@okr/subject-person-ui';

import { PersonStore } from './person.store';

@Component({
  selector: 'okr-person-edit-page',
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
    <okr-header [i18n]="{ title: headerTitle() }" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">

      <okr-avatar-toolbar 
        key="{{parentKey()}}" 
        [title]="toolbarTitle()" 
        modelType="person" 
        [readOnly]="isReadOnly()" 
        (imageSelected)="onImageSelected($event)"
      />

      @if(formData(); as formData) {
        <okr-person-form
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
              <okr-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
              <okr-membership-accordion [member]="person" [readOnly]="isReadOnly()"/>
              <okr-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" [readOnly]="hideAddButton()" />
              <okr-reservations-accordion [listId]="listId()" [readOnly]="hideAddButton()" />
              @if(hasRole('privileged') || hasRole('memberAdmin')) {
                <okr-personal-rel-accordion [person]="person" [readOnly]="isReadOnly()" />
                <okr-workrel-accordion [personKey]="personKey()" [readOnly]="isReadOnly()" />
                <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
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
  // seeded by the constructor effect, once per person. This must NOT be a linkedSignal: person() is
  // derived from a live Firestore stream, so every re-emission would hand back a new object reference
  // (or transiently undefined while the resource reloads) and silently discard the user's edits.
  public formData = signal<PersonModel | undefined>(undefined);
  /** okey of the person formData was seeded from -> lets us re-seed when navigating to another person */
  private seededPersonKey: string | undefined;
  protected showForm = signal(true);

  // derived signals
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.person()?.okey ?? ''));
  protected toolbarTitle = computed(() => getFullName(this.person()?.firstName, this.person()?.lastName, this.currentUser()?.nameDisplay));
  protected parentKey = computed(() => PersonModelName + '.' + this.personKey());
  protected priv = computed(() => this.store.privacySettings());
  protected currentUser = computed(() => this.store.currentUser());
  protected person = computed(() => this.store.person());
  protected defaultResource = computed(() => this.store.defaultResource());
  protected tags = computed(() => this.store.getTags());
  protected tenantId = computed(() => this.store.tenantId());
  protected genders = computed(() => this.store.appStore.getCategory('gender'));
  protected listId = computed(() => 'p_' + this.store.person()?.okey);
  protected hideAddButton = computed(() => {
    if (this.hasRole('resourceAdmin')) return false;
    return this.isReadOnly();
  });

  constructor() {
    effect(() => {
      const person = this.person();
      if (!person) return;                                  // still loading -> wait
      if (this.seededPersonKey === person.okey) return;     // already seeded -> never clobber edits
      this.seededPersonKey = person.okey;
      this.formData.set(safeStructuredClone(person));
    });
  }

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
