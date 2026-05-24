import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, OrgModel, OrgModelName, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, safeStructuredClone } from '@bk2/shared-util-core';
import { DEFAULT_TITLE } from '@bk2/shared-constants';
import { ENV } from '@bk2/shared-config';

import { AvatarToolbar } from '@bk2/avatar-feature';
import { AvatarService } from '@bk2/avatar-data-access';
import { CommentsAccordion } from '@bk2/comment-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { DocumentsAccordion } from '@bk2/document-feature';

import { BillAccordion } from '@bk2/finance-bill-feature';

import { MembersAccordion, MembershipAccordion } from '@bk2/relationship-membership-feature';
import { OwnershipAccordion } from '@bk2/relationship-ownership-feature';
import { ReservationsAccordion } from '@bk2/relationship-reservation-feature';

import { AddressesAccordion } from '@bk2/subject-address-feature';
import { OrgForm } from '@bk2/subject-org-ui';
import { OrgStore } from './org.store';

@Component({
  selector: 'bk-org-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    AvatarToolbar, AddressesAccordion, CommentsAccordion,
    OwnershipAccordion, OrgForm, MembershipAccordion, MembersAccordion,
    ReservationsAccordion, DocumentsAccordion, BillAccordion,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [OrgStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(!isNew()) {
        <bk-avatar-toolbar key="{{parentKey()}}" [title]="toolbarTitle()" modelType="org" [readOnly]="isReadOnly()" (imageSelected)="onImageSelected($event)"/>
      }
      @if(formData(); as formData) {
        <bk-org-form
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
      @if(!isNew()) {
        @if(org(); as org) {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <ion-accordion-group value="addresses" [multiple]="true">
                <bk-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" [priv]="priv()" />
                <bk-membership-accordion [member]="org" [readOnly]="isReadOnly()" modelType="org" />

                @if(hasRole('privileged') || !isReadOnly()) {
                    @if(resource(); as resource) {
                      <bk-ownerships-accordion [owner]="org" [defaultResource]="resource" ownerModelType="org" [readOnly]="isReadOnly()" />
                      <bk-reservations-accordion [listId]="listId()" [readOnly]="isReadOnly()" />
                      <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                    }
                    <bk-members-accordion [orgKey]="orgKey()" [orgType]="orgType()" [readOnly]="isReadOnly()" />
                    <bk-bill-accordion [listId]="orgKey()" />
                    <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                }
              </ion-accordion-group>
            </ion-card-content>
          </ion-card>
        }
      }
    </ion-content>
  `
})
export class OrgEditModal {
  protected readonly store = inject(OrgStore);
  private readonly modalController = inject(ModalController);
  private readonly avatarService = inject(AvatarService);
  private readonly env = inject(ENV);

  // inputs
  public org = input.required<OrgModel>();
  public currentUser = input<UserModel | undefined>();
  public resource = input<ResourceModel | undefined>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public types = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.org()));
  protected showForm = signal(true);

  // derived 
  protected headerTitle = computed(() => this.getTitleLabel(this.isReadOnly(), this.org()?.bkey));
  protected toolbarTitle = computed(() => this.org()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${OrgModelName}.${this.orgKey()}`);
  protected path = computed(() => getDocumentStoragePath(this.env.tenantId, 'org', this.org()?.bkey));
  protected orgKey = computed(() => this.org()?.bkey ?? '');
  protected orgType = computed((): 'org' | 'group' => this.org()?.type === 'group' ? 'group' : 'org');
  protected isNew = computed(() => !this.org()?.bkey.length);
  protected listId = computed(() => 'o_' + this.orgKey());
  protected priv = computed(() => this.store.privacySettings());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.org()));  // reset the form
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
    await this.avatarService.saveAvatarPhoto(photo, this.orgKey(), this.env.tenantId, OrgModelName);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getTitleLabel(readOnly: boolean, key: string): string {
    if (this.readOnly()) {
      return this.store.i18n.view_label();
    }
    if (key.length > 0) {
      return this.store.i18n.edit_label();
    } else {
      return this.store.i18n.create_label();
    }
  }
}
