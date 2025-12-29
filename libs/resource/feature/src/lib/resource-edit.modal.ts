import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { ResourceModel, ResourceModelName, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { getTitleLabel } from '@bk2/shared-util-angular';
import { DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';

import { ResourceFormComponent } from '@bk2/resource-ui';
import { isReservable } from '@bk2/resource-util';

@Component({
  selector: 'bk-resource-edit-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, ReservationsAccordionComponent,
    ResourceFormComponent, IconToolbarComponent, CommentsAccordionComponent, CategorySelectComponent,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      <bk-icon-toolbar icon="{{icon()}}" title="{{ toolbarTitle() }}"/>
      @if(isTypeEditable() && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      @if(formData(); as formData) {
        <bk-resource-form
          [formData]="formData" 
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="appStore.currentUser()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
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
export class ResourceEditModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);

  // inputs
  public resource = input.required<ResourceModel>();
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
  protected headerTitle = computed(() => getTitleLabel('resource.' + this.type(), this.resource()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => `${this.formData()?.name}`);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.appStore.currentUser());
  protected types = computed(() => this.appStore.getCategory(this.type()));
  protected subTypes = computed(() => this.appStore.getCategory(this.formData()?.subType));
  protected usages = computed(() => this.appStore.getCategory(this.formData()?.usage));
  protected tags = computed(() => this.appStore.getTags('resource'));
  protected type = linkedSignal(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected resourceKey = computed(() => this.resource()?.bkey ?? '');
  private rowingBoatIcon = computed(() => this.appStore.getCategoryItem('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.appStore.getCategoryIcon('resource_type', this.resource().type));
  protected icon = computed(() => this.type() === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.resource()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.formDirty.set(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }


  protected onFormDataChange(formData: ResourceModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }

  protected isReservable(resourceType: string): boolean {
    return isReservable(resourceType);
  }
}
