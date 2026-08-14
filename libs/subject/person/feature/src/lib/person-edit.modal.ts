import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, PersonModelName, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, getFullName, hasRole, safeStructuredClone } from '@okr/shared-util-core';

import { AvatarToolbar } from '@okr/avatar-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { getDocumentStoragePath } from '@okr/content-document-util';
import { DocumentsAccordion } from '@okr/content-document-feature';

import { MembershipAccordion } from '@okr/relationship-membership-feature';
import { OwnershipAccordion } from '@okr/relationship-ownership-feature';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';
import { PersonalRelAccordion } from '@okr/relationship-personal-rel-feature';
import { WorkrelAccordion } from '@okr/relationship-workrel-feature';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { PersonForm } from '@okr/subject-person-ui';
import { PersonFormModel } from '@okr/subject-person-util';

import { PersonStore } from './person.store';

@Component({
  selector: 'okr-person-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, PersonForm,
    AvatarToolbar, AddressesAccordion, CommentsAccordion,
    OwnershipAccordion, MembershipAccordion, WorkrelAccordion,
    ReservationsAccordion, DocumentsAccordion, PersonalRelAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [PersonStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
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
                [showForm]="showForm()"
                [allTags]="tags()"
                [tenantId]="tenantId()"
                [readOnly]="isReadOnly()"
                (dirty)="formDirty.set($event)"
                (valid)="formValid.set($event)"
            />
        }
        @if(person(); as person) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-accordion-group value="addresses" [multiple]="true">
                <okr-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
                <okr-membership-accordion [member]="person" [readOnly]="isReadOnly()" />

                @if(hasRole('privileged') || hasRole('memberAdmin') || hasRole('resourceAdmin')) {
                    <okr-ownerships-accordion [owner]="person" [defaultResource]="defaultResource()" [readOnly]="!hasRole('resourceAdmin')" />
                    <okr-reservations-accordion [listId]="listId()" [readOnly]="!hasRole('resourceAdmin')" />
                    @if(hasRole('memberAdmin')) {
                        <okr-personal-rel-accordion [person]="person" [readOnly]="false" />
                        <okr-workrel-accordion [personKey]="personKey()" [readOnly]="false" />
                    }
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
export class PersonEditModal {
  protected readonly store = inject(PersonStore);
  private readonly modalController = inject(ModalController);

  // inputs
  // the plain person document — ssn/dob are hydrated from the vault below (spec 1.19 Phase 4, D9)
  public person = input.required<PersonFormModel>();
  public currentUser = input<UserModel | undefined>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public genders = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.person()));
  protected showForm = signal(true);

  // derived signals and fields
  protected personKey = computed(() => this.person()?.okey ?? '');
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.personKey()));
  protected toolbarTitle = computed(() => getFullName(this.person()?.firstName, this.person()?.lastName, this.currentUser()?.nameDisplay));
  protected readonly parentKey = computed(() => PersonModelName + '.' + this.personKey());
  protected path = computed(() => getDocumentStoragePath(this.tenantId(), 'person', this.person()?.okey));
  protected listId = computed(() => 'p_' + this.personKey());
  protected priv = computed(() => this.store.privacySettings());
  protected defaultResource = computed(() => this.store.defaultResource());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /** the person key whose vault values were last requested — guards the async hydration below */
  private hydratedPersonKey = '';

  constructor() {
    effect(() => {
      const personKey = this.personKey();
      if (!personKey || this.hydratedPersonKey === personKey) return;
      this.hydratedPersonKey = personKey;
      void this.hydrateSensitive(personKey);
    });
  }

  /**
   * Hydrates the vault-backed ssn/dob/dod (spec 1.19 Phase 4, D9). The person document no
   * longer carries ssnId/dateOfBirth/dateOfDeath, and every opener (person list, membership,
   * reservation, personal-rel, aoc, chat) hands us the plain document — so the read belongs
   * here, in the one component they all share, not in each calling store. Mirrors person-edit.page.
   */
  private async hydrateSensitive(personKey: string): Promise<void> {
    const sensitive = await this.store.loadSensitive(personKey);
    // the modal may have been dismissed or the user may have started editing while the read was in flight
    if (this.hydratedPersonKey !== personKey || this.formDirty()) return;
    this.formData.update((vm) => vm
      ? { ...vm, ssnId: sensitive.ssn ?? '', dateOfBirth: sensitive.dob ?? '', dateOfDeath: sensitive.dod ?? '' }
      : vm);
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.person()));  // reset the form
    void this.hydrateSensitive(this.personKey());           // ...and re-read ssn/dob (not on the person document)
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: PersonFormModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.store.saveAvatar(photo, this.person().okey);
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
