import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { AppStore } from '@bk2/shared/feature';
import { ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { ModelType, ResourceCollection, ResourceModel, ResourceType, RowingBoatType, RoleName } from '@bk2/shared/models';
import { hasRole } from '@bk2/shared/util-core';
import { ResourceTypes, RowingBoatTypes } from '@bk2/shared/categories';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { ResourceFormComponent } from '@bk2/resource/ui';
import { convertFormToResource, convertResourceToForm, isReservable } from '@bk2/resource/util';

@Component({
  selector: 'bk-resource-edit-modal',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    ResourceFormComponent, IconToolbarComponent, CommentsAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-icon-toolbar icon="{{icon()}}" title="{{ title() }}"/>
      <bk-resource-form [(vm)]="vm" [currentUser]="appStore.currentUser()" [resourceTags]="resourceTags()" (validChange)="formIsValid.set($event)" [isTypeEditable]="isTypeEditable()" />

      <ion-accordion-group [multiple]="true">
        @if (isReservable(resource().type)) {
          <!-- <bk-reservations-accordion [resourceKey]="resourceKey()" [reservations]="[]" /> -->
        }
        @if(hasRole('resourceAdmin') && !isNew()) {
            <bk-comments-accordion [collectionName]="collectionName" [parentKey]="vm().bkey!" />
        }
      </ion-accordion-group>
    </ion-content>
  `
})
export class ResourceEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  public resource = input.required<ResourceModel>();
  public isTypeEditable = input(false);

  protected readonly isNew = computed(() => this.resource()?.bkey === undefined);
  protected resourceKey = computed(() => this.resource()?.bkey ?? '');
  public vm = linkedSignal(() => convertResourceToForm(this.resource()));
  protected headerTitle = computed(() => this.isNew() ? '@resource.operation.create.label' : '@resource.operation.update.label');
  protected title = computed(() => `${this.vm()?.name}`);
  protected rowingBoatType = computed(() => this.vm().rowingBoatType ?? RowingBoatType.b1x);
  protected rowingBoatIcon = computed(() => RowingBoatTypes[this.rowingBoatType()].icon);
  protected type = computed(() => this.vm().type ?? ResourceType.RowingBoat);
  protected resourceIcon = computed(() => ResourceTypes[this.type()].icon);
  protected resourceTags = computed(() => this.appStore.getTags(ModelType.Resource));

  protected icon = computed(() => {
    return this.vm().type === ResourceType.RowingBoat ? this.rowingBoatIcon() : this.resourceIcon();
  });

  protected collectionName = ResourceCollection;

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToResource(this.resource(), this.vm(), this.appStore.env.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }

  protected isReservable(resourceType: ResourceType): boolean {
    return isReservable(resourceType);
  }
}
