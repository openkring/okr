import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ViewWillEnter } from '@ionic/angular/standalone';

import { PersonModel, PersonModelName, RoleName } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { getFullName, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { PersonFormModel } from '@okr/subject-person-util';

import { MembershipAccordion } from '@okr/relationship-membership-feature';
import { OwnershipAccordion } from '@okr/relationship-ownership-feature';
import { PersonalRelAccordion } from '@okr/relationship-personal-rel-feature';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';
import { WorkrelAccordion } from '@okr/relationship-workrel-feature';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { DocumentsAccordion } from '@okr/content-document-feature';
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
  // Editing another person is memberAdmin-only, same rule as PersonList (self-service edits go
  // through /person/profile). This used to be a readOnly input defaulting to true, but the page is
  // only ever reached via the /person/:personKey route, where withComponentInputBinding() wrote
  // undefined into it -> coerceBoolean(undefined) === false -> the page opened editable for everyone.
  protected isReadOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));
  
  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  // seeded by the constructor effect, once per person. This must NOT be a linkedSignal: person() is
  // derived from a live Firestore stream, so every re-emission would hand back a new object reference
  // (or transiently undefined while the resource reloads) and silently discard the user's edits.
  // ssn/dob are NOT on the person document (spec 1.19 Phase 4) — they live in the addresses
  // vault and are hydrated into the form model by seed() below.
  public formData = signal<PersonFormModel | undefined>(undefined);
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
      this.seed(person);
    });
  }

  /**
   * Seeds the form from the person document and then hydrates the vault-backed ssn/dob/dod
   * (spec 1.19 Phase 4, D9) — without them the fields render empty for every role, since
   * the person document no longer carries ssnId/dateOfBirth/dateOfDeath. Saving is already
   * vault-aware: PersonService.create/update strip the fields off the person write and sync the vault.
   */
  private seed(person: PersonModel): void {
    const formPerson = safeStructuredClone(person) as PersonFormModel;
    this.formData.set(formPerson);
    void this.hydrateSensitive(person.okey);
  }

  private async hydrateSensitive(personKey: string): Promise<void> {
    const sensitive = await this.store.loadSensitive(personKey);
    // the user may have navigated on or started editing while the vault read was in flight
    if (this.seededPersonKey !== personKey || this.formDirty()) return;
    this.formData.update((vm) => vm
      ? { ...vm, ssnId: sensitive.ssn ?? '', dateOfBirth: sensitive.dob ?? '', dateOfDeath: sensitive.dod ?? '' }
      : vm);
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
      this.seed(person);  // reset the form (person document + vault-backed ssn/dob)
    }
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => {
      this.showForm.set(true);
    }, 0);
  }

  protected onFormDataChange(formData: PersonFormModel): void {
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
    if (readOnly) {
      return this.store.i18n.view();
    }
    if (key.length > 0) {
      return this.store.i18n.update();
    } else {
      return this.store.i18n.create();
    }
  }
}
