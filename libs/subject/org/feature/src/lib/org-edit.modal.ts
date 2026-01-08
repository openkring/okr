import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Photo } from '@capacitor/camera';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryListModel, OrgModel, OrgModelName, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_TITLE } from '@bk2/shared-constants';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { ENV } from '@bk2/shared-config';

import { AvatarToolbarComponent } from '@bk2/avatar-feature';
import { AvatarService } from '@bk2/avatar-data-access';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { getDocumentStoragePath } from '@bk2/document-util';
import { DocumentsAccordionComponent } from '@bk2/document-feature';

import { MembersAccordionComponent, MembershipAccordionComponent } from '@bk2/relationship-membership-feature';
import { OwnershipAccordionComponent } from '@bk2/relationship-ownership-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';

import { AddressesAccordionComponent } from '@bk2/subject-address-feature';
import { OrgFormComponent } from '@bk2/subject-org-ui';

@Component({
  selector: 'bk-org-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    OwnershipAccordionComponent, OrgFormComponent, MembershipAccordionComponent, MembersAccordionComponent,
    ReservationsAccordionComponent, DocumentsAccordionComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(!isNew()) {
        <bk-avatar-toolbar key="{{parentKey()}}" title="{{ toolbarTitle() }}" modelType="org" [readOnly]="isReadOnly()" (imageSelected)="onImageSelected($event)"/>
      }
      @if(formData(); as formData) {
        <bk-org-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [types]="types()"
          [showForm]="showForm()"
          [allTags]="tags()"
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
                <bk-addresses-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
                <bk-membership-accordion [member]="org" [readOnly]="isReadOnly()" modelType="org" />

                @if(hasRole('privileged') || !isReadOnly()) {
                    @if(resource(); as resource) {
                      <bk-ownerships-accordion [owner]="org" [defaultResource]="resource" ownerModelType="org" [readOnly]="isReadOnly()" />
                      <bk-reservations-accordion [reserver]="org" [readOnly]="isReadOnly()" reserverModelType="org" [resource]="resource" />
                      <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()"/>
                    }
                    <bk-members-accordion [orgKey]="orgKey()" [readOnly]="isReadOnly()" />
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
export class OrgEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly avatarService = inject(AvatarService);
  private readonly env = inject(ENV);

  // inputs
  public org = input.required<OrgModel>();
  public currentUser = input<UserModel | undefined>();
  public resource = input<ResourceModel | undefined>();
  public tags = input.required<string>();
  public types = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.org()));
  protected showForm = signal(true);

  // derived signals and fields
  protected headerTitle = computed(() => getTitleLabel('subject.org', this.org()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => this.org()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${OrgModelName}.${this.orgKey()}`);
  protected path = computed(() => getDocumentStoragePath(this.env.tenantId, 'org', this.org()?.bkey));
  protected orgKey = computed(() => this.org()?.bkey ?? '');
  protected isNew = computed(() => !this.org()?.bkey.length);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.org()));  // reset the form
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
}
