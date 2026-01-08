import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { AvatarInfo, OwnershipModel, OwnershipModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, newAvatarInfo } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { DocumentsAccordionComponent } from '@bk2/document-feature';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { OwnershipFormComponent } from '@bk2/relationship-ownership-ui';
import { getOwnerName } from '@bk2/relationship-ownership-util';

@Component({
  selector: 'bk-ownership-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, HeaderComponent, DocumentsAccordionComponent,
    ChangeConfirmationComponent, OwnershipFormComponent, RelationshipToolbarComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    } 
    <ion-content class="ion-no-padding">
      @if (currentUser(); as currentUser) {
        <bk-relationship-toolbar
          relType="ownership"
          [subjectAvatar]="resourceAvatar()"
          [types]="resourceTypes()"
          [objectAvatar]="ownerAvatar()"
          [currentUser]="currentUser"
        />
        
        @if(formData(); as formData) {
          <bk-ownership-form
            [formData]="formData"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [allTags]="tags()"
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
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class OwnershipEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public ownership = input.required<OwnershipModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

    // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.ownership()));
  protected showForm = signal(true);

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('ownership', this.ownership()?.bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${OwnershipModelName}.${this.bkey()}`);
  protected readonly tags = computed(() => this.appStore.getTags('ownership'));
  protected readonly name = computed(() => getOwnerName(this.ownership()));
  protected readonly resourceTypes = computed(() => this.appStore.getCategory('resource_type'));
  protected ownerAvatar = computed<AvatarInfo>(() => {
    const o = this.ownership();
    return newAvatarInfo(o.ownerKey, o.ownerName1, o.ownerName2, o.ownerModelType, o.ownerType, '', this.name());
  });
  protected resourceAvatar = computed<AvatarInfo>(() => {
    const o = this.ownership();
    return newAvatarInfo(o.resourceKey, '', o.resourceName, o.resourceModelType, o.resourceType, o.resourceSubType, o.resourceName);
  });
  protected bkey = computed(() => this.ownership().bkey);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');    
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.ownership()));  // reset the form
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
