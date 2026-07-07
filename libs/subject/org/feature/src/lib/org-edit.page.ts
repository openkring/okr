import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ViewWillEnter } from '@ionic/angular/standalone';

import { OrgModel, OrgModelName, RoleName } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { DEFAULT_TITLE } from '@okr/shared-constants';

import { AvatarToolbar } from '@okr/avatar-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { DocumentsAccordion } from '@okr/document-feature';
import { BillAccordion } from '@okr/finance-bill-feature';

import { MembersAccordion, MembershipAccordion } from '@okr/relationship-membership-feature';
import { OwnershipAccordion } from '@okr/relationship-ownership-feature';
import { ReservationsAccordion } from '@okr/relationship-reservation-feature';

import { AddressesAccordion } from '@okr/subject-address-feature';
import { OrgForm } from '@okr/subject-org-ui';

import { OrgStore } from './org.store';

@Component({
  selector: 'okr-org-edit-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    AvatarToolbar, AddressesAccordion, CommentsAccordion, DocumentsAccordion, BillAccordion,
    OrgForm, MembershipAccordion, MembersAccordion, OwnershipAccordion, ReservationsAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [OrgStore],
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
        modelType="org"
        [readOnly]="isReadOnly()"
        (imageSelected)="onImageSelected($event)"
      />

      @if(formData(); as formData) {
        <okr-org-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="store.i18n"
          [currentUser]="currentUser()"
          [types]="types()"
          [showForm]="showForm()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(org(); as org) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="addresses" [multiple]="true">
              <okr-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
              <okr-membership-accordion [member]="org" [readOnly]="isReadOnly()" modelType="org" />
              @if(hasRole('privileged') || hasRole('memberAdmin') || hasRole('resourceAdmin')) {
                @if(defaultResource(); as resource) {
                  <okr-ownerships-accordion [owner]="org" [defaultResource]="resource" ownerModelType="org" [readOnly]="isReadOnly()" />
                  <okr-reservations-accordion [listId]="listId()" [readOnly]="isReadOnly()" />
                }
                <okr-members-accordion [orgKey]="orgKey()" [orgType]="orgType()" [readOnly]="isReadOnly()" />
                <okr-bill-accordion [listId]="orgKey()" />
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
export class OrgEditPage implements ViewWillEnter {
  protected readonly store = inject(OrgStore);

  // inputs
  public orgKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => safeStructuredClone(this.org()));
  protected showForm = signal(true);

  // derived signals
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.org()?.okey ?? ''));
  protected toolbarTitle = computed(() => this.org()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${OrgModelName}.${this.orgKey()}`);
  protected orgType = computed((): 'org' | 'group' => this.org()?.type === 'group' ? 'group' : 'org');
  protected listId = computed(() => 'o_' + this.orgKey());
  protected priv = computed(() => this.store.privacySettings());
  protected currentUser = computed(() => this.store.currentUser());
  protected org = computed(() => this.store.org());
  protected defaultResource = computed(() => this.store.defaultResource());
  protected tags = computed(() => this.store.tags());
  protected types = computed(() => this.store.types());
  protected tenantId = computed(() => this.store.tenantId());

  /**
   * Lifecycle hook that is called when the view is about to enter and become the active page.
   */
  ionViewWillEnter() {
    this.store.setOrgKey(this.orgKey());
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const org = this.formData();
    if (!org) return;
    await this.store.save(org);
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    const org = this.org();
    if (org) {
      this.formData.set(safeStructuredClone(org));  // reset the form
    }
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OrgModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.store.saveAvatar(photo, this.orgKey());
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
