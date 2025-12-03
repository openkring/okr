import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OwnershipModel, OwnershipModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { DocumentsAccordionComponent } from '@bk2/document-feature';
import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { OwnershipFormComponent } from '@bk2/relationship-ownership-ui';
import { convertFormToOwnership, convertOwnershipToForm, getOwnerName, OwnershipFormModel } from '@bk2/relationship-ownership-util';

@Component({
  selector: 'bk-ownership-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    CommentsAccordionComponent, HeaderComponent, DocumentsAccordionComponent,
    ChangeConfirmationComponent, OwnershipFormComponent, RelationshipToolbarComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async}}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    } 
    <ion-content no-padding>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />
      
      @if(formData(); as formData) {
        <bk-ownership-form
          [formData]="formData"
          [currentUser]="currentUser()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
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
  public formData = linkedSignal(() => convertOwnershipToForm(this.ownership()));

  // derived signals
  protected readonly headerTitle = computed(() => getTitleLabel('ownership', this.ownership()?.bkey, this.isReadOnly()));
  protected readonly parentKey = computed(() => `${OwnershipModelName}.${this.bkey()}`);
  protected readonly tags = computed(() => this.appStore.getTags('ownership'));
  protected readonly name = computed(() => getOwnerName(this.ownership()));
  protected titleArguments = computed(() => ({
    relationship: 'ownership',
    objectName: this.name(),
    objectIcon: this.ownership().ownerModelType === 'person' ? 'person' : 'org',
    objectUrl: this.objectUrl(),
    subjectName: this.ownership().resourceName,
    subjectIcon: 'resource',
    subjectUrl: this.resourceUrl()
  }));
  protected bkey = computed(() => this.ownership().bkey);
  private readonly objectUrl = computed(() => this.getUrl(this.ownership().ownerModelType, this.ownership().ownerKey));
  private readonly resourceUrl = computed(() => this.getUrl(this.ownership().resourceModelType, this.ownership().resourceKey));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToOwnership(this.formData(), this.ownership()), 'confirm');    
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertOwnershipToForm(this.ownership()));  // reset the form
  }

  protected onFormDataChange(formData: OwnershipFormModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  private getUrl(modelType?: string, bkey?: string): string {
    return (modelType === undefined || bkey === undefined)  ? '' : `/${modelType}/${bkey}`;
  }
}
