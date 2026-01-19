import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ResourceModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_RESOURCE_TYPE, DEFAULT_TITLE } from '@bk2/shared-constants';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';

import { ResourceFormComponent } from '@bk2/resource-ui';
import { ResourceEditStore } from './resource-edit.store';
import { getCategoryNameForResourceType, getUsageNameForResourceType, isReservable } from '@bk2/resource-util';

@Component({
  selector: 'bk-resource-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CommentsAccordionComponent, IconToolbarComponent, ResourceFormComponent, CategorySelectComponent,
    ReservationsAccordionComponent,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceEditStore],
  template: `
    <bk-header [title]="headerTitle()" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-icon-toolbar icon="{{icon()}}" title="{{ toolbarTitle() }}"/>
      @if(isTypeEditable() === true && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onTypeChange($event)" [withAll]="false" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      {{ readOnly()}}
      @if(formData(); as formData) {
        <bk-resource-form
          [formData]="formData" 
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="isReadOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }

      @if(resource(); as resource) {
        <ion-accordion-group [multiple]="true">
          @if (isReservable(resource.type)) {
            <bk-reservations-accordion [resource]="resource" [readOnly]="isReadOnly()" />
          }
          @if(hasRole('privileged') || hasRole('resourceAdmin')) {
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
          }
        </ion-accordion-group>
      }
    </ion-content>
  `
})
export class ResourceEditPageComponent {
  private readonly resourceEditStore = inject(ResourceEditStore);

  // inputs
  public resourceKey = input.required<string>();
  public isTypeEditable = input(false);
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.resource()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => getTitleLabel('resource.type.' + this.type(), this.resource()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => this.formData()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.resourceEditStore.currentUser());
  protected types = computed(() => this.resourceEditStore.appStore.getCategory('resource_type'));
  protected type = linkedSignal(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected subTypes = computed(() => {
    const catName = getCategoryNameForResourceType(this.type());
    return catName ? this.resourceEditStore.appStore.getCategory(catName) : undefined;
  });
  protected usages = computed(() => {
    const usageName = getUsageNameForResourceType(this.type());
    return usageName ? this.resourceEditStore.appStore.getCategory(usageName) : undefined;
  });
  private rowingBoatIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('resource_type', this.formData()?.type));
  protected icon = computed(() => this.formData()?.type === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());
  protected resource = computed(() => this.resourceEditStore.resource());
  protected tags = computed(() => this.resourceEditStore.getTags());
  protected tenantId = computed(() => this.resourceEditStore.tenantId());

  constructor() {
    effect(() => {
      this.resourceEditStore.setResourceKey(this.resourceKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.resourceEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.resource()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onTypeChange(type: string): void {
    this.formDirty.set(true);
    console.log('onTypeChange: ERROR: ', type);
    //this.formData.update(vm => ({ ...vm, type }));
  }

  protected onFormDataChange(formData: ResourceModel): void {
    this.formData.set(formData);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected isReservable(resourceType?: string): boolean {
    if (!resourceType || resourceType.length === 0) return false;
    return isReservable(resourceType);
  }
}
