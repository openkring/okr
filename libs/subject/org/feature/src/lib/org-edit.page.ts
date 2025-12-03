import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModelName, RoleName } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_TITLE } from '@bk2/shared-constants';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { MembersAccordionComponent, MembershipAccordionComponent } from '@bk2/relationship-membership-feature';
import { OwnershipAccordionComponent } from '@bk2/relationship-ownership-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';

import { AddressesAccordionComponent } from '@bk2/subject-address-feature';
import { OrgFormComponent } from '@bk2/subject-org-ui';
import { convertOrgToForm, OrgFormModel } from '@bk2/subject-org-util';

import { OrgEditStore } from './org-edit.store';

@Component({
  selector: 'bk-org-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    OwnershipAccordionComponent, OrgFormComponent, MembershipAccordionComponent, MembersAccordionComponent,
    ReservationsAccordionComponent, DocumentsAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [OrgEditStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-avatar-toolbar key="{{parentKey()}}" title="{{ toolbarTitle() }}" [readOnly]="isReadOnly()" (imageSelected)="onImageSelected($event)"/>
      @if(formData(); as formData) {
        <bk-org-form
          [formData]="formData"
          [currentUser]="currentUser()"
          [types]="types()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      }
      @if(org(); as org) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="members" [multiple]="true">
              <bk-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-membership-accordion [member]="org" [readOnly]="isReadOnly()" modelType="org" />

              @if(hasRole('privileged') || !isReadOnly()) {
                @if(defaultResource(); as defaultResource) {
                  <bk-ownerships-accordion [owner]="org" [defaultResource]="defaultResource" ownerModelType="org" [readOnly]="isReadOnly()" />
                  <bk-reservations-accordion [reserver]="org" [readOnly]="isReadOnly()" reserverModelType="org" [resource]="defaultResource" />
                  <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                }
                <bk-members-accordion [orgKey]="orgKey()" [readOnly]="isReadOnly()" />
                <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              }
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class OrgEditPageComponent {
  private readonly orgEditStore = inject(OrgEditStore);

  // inputs
  public orgKey = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertOrgToForm(this.org()));

  // derived signals and fields
  protected headerTitle = computed(() => getTitleLabel('subject.org', this.org()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => this.org()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${OrgModelName}.${this.orgKey()}`);
  protected currentUser = computed(() => this.orgEditStore.currentUser());
  protected org = computed(() => this.orgEditStore.org());
  protected defaultResource = computed(() => this.orgEditStore.defaultResource());
  protected path = computed(() => getDocumentStoragePath(this.orgEditStore.tenantId(), 'org', this.org()?.bkey));
  protected tags = computed(() => this.orgEditStore.getTags());
  protected types = computed(() => this.orgEditStore.appStore.getCategory('org_type'));

  constructor() {
    effect(() => {
      this.orgEditStore.setOrgKey(this.orgKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.orgEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertOrgToForm(this.org()));  // reset the form
  }

  protected onFormDataChange(formData: OrgFormModel): void {
    this.formData.set(formData);
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    await this.orgEditStore.saveAvatar(photo);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
