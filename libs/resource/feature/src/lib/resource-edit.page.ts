import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';
import { hasRole } from '@bk2/shared/util';
import { ModelType, ResourceCollection, ResourceType, RowingBoatType } from '@bk2/shared/models';
import { ResourceTypes, RowingBoatTypes } from '@bk2/shared/categories';

import { CommentsAccordionComponent } from '@bk2/comment/feature';
import { convertResourceToForm, isReservable} from '@bk2/resource/util';
import { ResourceEditStore } from './resource-edit.store';
import { ResourceFormComponent } from '@bk2/resource/ui';

@Component({
  selector: 'bk-resource-edit-page',
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CommentsAccordionComponent, IconToolbarComponent, ResourceFormComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup
  ],
  providers: [ResourceEditStore],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-icon-toolbar icon="{{icon()}}" title="{{ title() }}"/>
      @if(resource(); as resource) {
        <bk-resource-form [(vm)]="vm" [currentUser]="currentUser()" [resourceTags]="resourceTags()" (validChange)="formIsValid.set($event)" [isTypeEditable]="isTypeEditable()" />
      }

      <ion-accordion-group [multiple]="true">
         <!--
        @if (isReservable(resource()?.type)) {
          <bk-reservations-accordion [resourceKey]="resourceKey()" [reservations]="[]" /> 
        }
          -->
      @if(hasRole('resourceAdmin') && !isNew()) {
          <bk-comments-accordion [collectionName]="resourceCollection" [parentKey]="vm().bkey!" />
      }
      </ion-accordion-group>
    </ion-content>
  `
})
export class ResourceEditPageComponent {
  private readonly resourceEditStore = inject(ResourceEditStore);

  public resourceKey = input.required<string>();
  public isTypeEditable = input(false);

  protected readonly isNew = computed(() => this.resourceEditStore.resource()?.bkey === undefined);
  public vm = linkedSignal(() => convertResourceToForm(this.resource()));
  protected headerTitle = computed(() => this.isNew() ? '@resource.operation.create.label' : '@resource.operation.update.label');
  protected currentUser = computed(() => this.resourceEditStore.currentUser());
  protected resource = computed(() => this.resourceEditStore.resource());
  protected title = computed(() => `${this.vm()?.name}`);
  protected type = computed(() => this.vm().type ?? ResourceType.RowingBoat);
  protected rowingBoatType = computed(() => this.vm().rowingBoatType ?? RowingBoatType.b1x);
  protected rowingBoatIcon = computed(() => RowingBoatTypes[this.rowingBoatType()].icon);
  protected resourceIcon = computed(() => ResourceTypes[this.type()].icon);
  protected resourceTags = computed(() => this.resourceEditStore.getTags());

  protected icon = computed(() => {
    return this.vm().type === ResourceType.RowingBoat ? this.rowingBoatIcon() : this.resourceIcon();
  });

  protected formIsValid = signal(false);
  protected modelType = ModelType;
  protected resourceCollection = ResourceCollection;

  constructor() {
    effect(() => {
      this.resourceEditStore.setResourceKey(this.resourceKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.resourceEditStore.save(this.vm());
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isReservable(resourceType?: ResourceType): boolean {
    if (!resourceType) return false;
    return isReservable(resourceType);
  }
}
