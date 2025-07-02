import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, Platform } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent, UploadService } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ENV } from '@bk2/shared/config';
import { ModelType, OrgCollection, OrgType, RoleName } from '@bk2/shared/models';
import { Photo } from '@capacitor/camera';
import { hasRole } from '@bk2/shared/util-core';
import { AvatarService } from '@bk2/avatar/data-access';
import { getDocumentStoragePath } from '@bk2/document/util';

import { AddressesAccordionComponent } from '@bk2/address/feature';
import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { OwnershipAccordionComponent } from '@bk2/ownership/feature';
import { OrgEditStore } from './org-edit.store';
import { OrgFormComponent } from '@bk2/org/ui';
import { MembersAccordionComponent, MembershipAccordionComponent } from '@bk2/membership/feature';
import { convertOrgToForm } from '@bk2/org/util';
import { newAvatarModel, readAsFile } from '@bk2/avatar/util';
import { AvatarToolbarComponent } from '@bk2/avatar/feature';

@Component({
  selector: 'bk-org-edit-page',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    AvatarToolbarComponent, AddressesAccordionComponent, CommentsAccordionComponent,
    OwnershipAccordionComponent, OrgFormComponent, MembershipAccordionComponent, MembersAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  providers: [OrgEditStore],
  template: `
    <bk-header title="{{ '@subject.org.operation.update.label' | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-avatar-toolbar key="{{avatarKey()}}" (imageSelected)="onImageSelected($event)" [isEditable]="hasRole('memberAdmin')" title="{{ title() }}"/>
      @if(org(); as org) {
        <bk-org-form [(vm)]="vm" [currentUser]="currentUser()" [orgTags]="orgTags()" (validChange)="formIsValid.set($event)" />

        <ion-accordion-group value="members" [multiple]="true">
          <bk-addresses-accordion [parentKey]="orgKey()" [readOnly]="false" [parentModelType]="modelType.Org" [addresses]="addresses()" 
            [readOnly]="!hasRole('memberAdmin')" (addressesChanged)="onAddressesChanged()" />
          <bk-membership-accordion [member]="org" [modelType]="modelType.Org" />
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            @if(defaultResource(); as defaultResource) {
              <bk-ownerships-accordion [owner]="org" [ownerModelType]="modelType.Org" [defaultResource]="defaultResource" />
              <!--
              <bk-reservations-accordion [reserver]="org" [reserverModelType]="modelType.Org" [defaultResource]="defaultResource" />
            -->
            }
            <bk-members-accordion [orgKey]="orgKey()" />
            <bk-comments-accordion [collectionName]="orgCollection" [parentKey]="orgKey()" />
          }
        </ion-accordion-group>
      }

    <!--   
          @if(hasRole('privileged') || hasRole('memberAdmin')) {
            <bk-documents-accordion [documents]="[]" [path]="vm().bkey!" />
          }
         -->
    </ion-content>
  `
})
export class OrgEditPageComponent {
  private readonly avatarService = inject(AvatarService);
  private readonly orgEditStore = inject(OrgEditStore);
  private readonly uploadService = inject(UploadService);
  private readonly platform = inject(Platform);
  private readonly env = inject(ENV);

  public orgKey = input.required<string>();

  protected currentUser = computed(() => this.orgEditStore.currentUser());
  protected org = computed(() => this.orgEditStore.org());
  protected defaultResource = computed(() => this.orgEditStore.defaultResource());
  protected addresses = computed(() => this.orgEditStore.addresses());
  public vm = linkedSignal(() => convertOrgToForm(this.org()));
  protected path = computed(() => getDocumentStoragePath(this.orgEditStore.tenantId(), ModelType.Org, this.org()?.bkey));
  protected avatarKey = computed(() => `${ModelType.Org}.${this.orgKey()}`);
  protected title = computed(() => this.org()?.name ?? '');
  protected orgTags = computed(() => this.orgEditStore.getOrgTags());

  protected formIsValid = signal(false);
  protected modelType = ModelType;
  protected orgType = OrgType;
  protected orgCollection = OrgCollection;

  constructor() {
    effect(() => {
      this.orgEditStore.setOrgKey(this.orgKey());
    });
  }

  public async save(): Promise<void> {
    await this.orgEditStore.save(this.vm());
  }

  /**
   * Uploads an image to Firebase storage and saves it as an avatar model in the database.
   * @param photo the avatar photo that is uploaded to and stored in the firebase storage
   */
  public async onImageSelected(photo: Photo): Promise<void> {
    const _org = this.org();
    if (!_org) return;
    const _file = await readAsFile(photo, this.platform);
    const _avatar = newAvatarModel([this.env.tenantId], ModelType.Org, _org.bkey, _file.name);
    const _downloadUrl = await this.uploadService.uploadFile(_file, _avatar.storagePath, '@document.operation.upload.avatar.title')

    if (_downloadUrl) {
      await this.avatarService.updateOrCreate(_avatar);
    }
  }

  protected onAddressesChanged(): void {
    this.orgEditStore.reloadAddresses();
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
