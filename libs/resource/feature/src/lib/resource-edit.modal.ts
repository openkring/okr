import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ResourceCollection, ResourceModel, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ResourceFormComponent } from '@bk2/resource-ui';
import { convertFormToResource, convertResourceToForm, isReservable } from '@bk2/resource-util';
import { DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

@Component({
  selector: 'bk-resource-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    ResourceFormComponent, IconToolbarComponent, CommentsAccordionComponent, CategorySelectComponent,
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
      @if(isTypeEditable() === true && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" [withAll]="false" (changed)="onTypeChange($event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      <bk-resource-form [(vm)]="vm" 
        [currentUser]="appStore.currentUser()"
        [types]="types()"
        [subTypes]="subTypes()"
        [usages]="usages()"
        [allTags]="tags()" 
        (validChange)="formIsValid.set($event)" 
      />

      <ion-accordion-group [multiple]="true">
        <!--
        @if (isReservable(resource().type)) {
           <bk-reservations-accordion [resourceKey]="resourceKey()" [reservations]="[]" /> 
        }
           -->
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

  public vm = linkedSignal(() => convertResourceToForm(this.resource()));
  protected currentUser = computed(() => this.appStore.currentUser());
  protected types = computed(() => this.appStore.getCategory(this.vm().type));
  protected subTypes = computed(() => this.appStore.getCategory(this.vm().subType));
  protected usages = computed(() => this.appStore.getCategory(this.vm().usage));
  protected tags = computed(() => this.appStore.getTags('resource'));
  protected type = computed(() => this.vm().type ?? DEFAULT_RESOURCE_TYPE);
  protected resourceKey = computed(() => this.resource()?.bkey ?? '');

  protected readonly isNew = computed(() => this.resource()?.bkey === undefined);
  protected headerTitle = computed(() => this.isNew() ? '@resource.operation.create.label' : '@resource.operation.update.label');
  protected title = computed(() => `${this.vm()?.name}`);
  private rowingBoatIcon = computed(() => this.appStore.getCategoryItem('rboat_type', this.vm().subType));
  private resourceIcon = computed(() => this.appStore.getCategoryIcon('resource_type', this.resource().type));
  protected icon = computed(() => this.type() === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());

  protected collectionName = ResourceCollection;

  protected formIsValid = signal(false);

  public save(): Promise<boolean> {
    return this.modalController.dismiss(convertFormToResource(this.resource(), this.vm(), this.appStore.env.tenantId), 'confirm');
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }

  protected isReservable(resourceType: string): boolean {
    return isReservable(resourceType);
  }

  protected onTypeChange($event: string): void {
    this.vm.update((vm) => ({ ...vm, type: $event }));
  }
}
