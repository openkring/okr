import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, OwnershipModel, OwnershipModelName, ResourceModelName, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, hasRole, newAvatarInfo, safeStructuredClone } from '@okr/shared-util-core';

import { DocumentsAccordion } from '@okr/content-document-feature';
import { CommentsAccordion } from '@okr/comment-feature';
import { OwnershipForm } from '@okr/relationship-ownership-ui';
import { getOwnerName } from '@okr/relationship-ownership-util';
import { RelationshipToolbar } from '@okr/avatar-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { OwnershipStore } from './ownership.store';

@Component({
  selector: 'okr-ownership-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordion, Header, DocumentsAccordion,
    ChangeConfirmation, OwnershipForm, RelationshipToolbar,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  providers: [OwnershipStore],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (currentUser(); as currentUser) {
        <okr-relationship-toolbar
          relType="ownership"
          [subjectAvatar]="resourceAvatar()"
          [subjectDefaultIcon]="subjectDefaultIcon()"
          [types]="resourceTypes()"
          [objectAvatar]="ownerAvatar()"
          [objectDefaultIcon]="objectDefaultIcon()"
          [relDesc1]="store.i18n.relDesc1()" [relDesc2]="store.i18n.relDesc2()"
          [currentUser]="currentUser"
        />
        
        @if(formData(); as formData) {
          <okr-ownership-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
            [tenantId]="tenantId()"
            [i18n]="store.i18n"
            [readOnly]="isReadOnly()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }

      @if(hasRole('privileged') || !isReadOnly()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <okr-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <okr-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class OwnershipEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(OwnershipStore);
  
  // inputs
  public ownership = input.required<OwnershipModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

    // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.ownership()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => this.store.getTitleLabel(this.isReadOnly(), this.ownership()?.okey));
  protected readonly parentKey = computed(() => `${OwnershipModelName}.${this.okey()}`);
  protected readonly tags = computed(() => this.store.getTags());
  protected readonly name = computed(() => getOwnerName(this.ownership()));
  protected readonly resourceTypes = computed(() => this.store.appStore.getCategory('resource_type'));
  protected readonly tenantId = computed(() => this.store.tenantId());
  protected ownerAvatar = computed<AvatarInfo>(() => {
    const o = this.ownership();
    return newAvatarInfo(o.ownerKey, o.ownerName1, o.ownerName2, o.ownerModelType, o.ownerType, '', this.name());
  });
  protected resourceAvatar = computed<AvatarInfo>(() => {
    const o = this.ownership();
    return newAvatarInfo(o.resourceKey, '', o.resourceName, o.resourceModelType, o.resourceType, o.resourceSubType, o.resourceName);
  });
  protected okey = computed(() => this.ownership().okey);
  protected readonly subjectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(ResourceModelName, this.resourceAvatar()?.type, this.resourceAvatar()?.subType));
  protected readonly objectDefaultIcon = computed(() => this.store.appStore.getDefaultIcon(this.ownerAvatar()?.modelType));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');    
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.ownership()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OwnershipModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
