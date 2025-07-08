import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ModelType, OwnershipCollection, OwnershipModel, UserModel, RoleName } from '@bk2/shared/models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { hasRole } from '@bk2/shared/util-core';
import { AppStore } from '@bk2/shared/feature';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { convertFormToOwnership, convertOwnershipToForm, getOwnerName } from '@bk2/relationship/ownership/util';
import { OwnershipFormComponent } from '@bk2/relationship/ownership/ui';

@Component({
  selector: 'bk-ownership-edit-modal',
  imports: [
    AsyncPipe, TranslatePipe,
    CommentsAccordionComponent, HeaderComponent,
    ChangeConfirmationComponent, OwnershipFormComponent, RelationshipToolbarComponent,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ modalTitle() | translate | async}}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    } 
    <ion-content>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />
      
      <bk-ownership-form [(vm)]="vm" [currentUser]="currentUser()" [ownershipTags]="ownershipTags()" (validChange)="formIsValid.set($event)" />

      @if(hasRole('privileged')) {
        <ion-accordion-group value="comments">
          <bk-comments-accordion [collectionName]="collectionName" [parentKey]="bkey()" />
        </ion-accordion-group>
      }
      <!--
        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <bk-documents-accordion [modelType]="modelType.Ownership"[parentKey]="vm.bkey!" />
        }
      -->
    </ion-content>
  `
})
export class OwnershipEditModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public ownership = input.required<OwnershipModel>();
  public currentUser = input<UserModel | undefined>();
  protected readonly ownershipTags = computed(() => this.appStore.getTags(ModelType.Ownership))

  protected vm = linkedSignal(() => convertOwnershipToForm(this.ownership()));
  protected modalTitle = computed(() => this.getModalTitle());
  protected readonly name = computed(() => getOwnerName(this.ownership()));
  protected titleArguments = computed(() => ({
    relationship: 'ownership',
    objectName: this.name(),
    objectIcon: this.ownership().ownerModelType === ModelType.Person ? 'person' : 'org',
    objectUrl: this.objectUrl(),
    subjectName: this.ownership().resourceName,
    subjectIcon: 'resource',
    subjectUrl: this.resourceUrl()
  }));

  protected bkey = computed(() => this.ownership().bkey);
  private readonly objectUrl = computed(() => this.getUrl(this.ownership().ownerModelType, this.ownership().ownerKey));
  private readonly resourceUrl = computed(() => this.getUrl(this.ownership().resourceModelType, this.ownership().resourceKey));

  public collectionName = OwnershipCollection;
  protected formIsValid = signal(false);

  public async save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToOwnership(this.ownership(), this.vm(), this.appStore.tenantId()), 'confirm');    
  }

  private getModalTitle(): string {
    const _operation = hasRole('resourceAdmin', this.currentUser()) ? 'update' : 'view';
    return `@ownership.operation.${_operation}.label`;
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  private getUrl(modelType?: ModelType, bkey?: string): string {
    if (modelType === undefined || bkey === undefined) return '';
    switch (modelType) {
      case ModelType.Person:
        return `/person/${bkey}`;
      case ModelType.Org:
        return `/org/${bkey}`;
      case ModelType.Resource:
        return `/resource/${bkey}`;
      case ModelType.Account:
        return `/account/${bkey}`;
      default:
        return '';
    }
  }

}
