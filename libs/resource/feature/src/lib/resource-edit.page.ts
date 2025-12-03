import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ResourceModelName, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_RESOURCE_TYPE, DEFAULT_TITLE } from '@bk2/shared-constants';
import { getTitleLabel } from '@bk2/shared-util-angular';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ReservationsAccordionComponent } from '@bk2/relationship-reservation-feature';

import { ResourceFormComponent } from '@bk2/resource-ui';
import { convertResourceToForm, isReservable, ResourceFormModel } from '@bk2/resource-util';
import { ResourceEditStore } from './resource-edit.store';

@Component({
  selector: 'bk-resource-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CommentsAccordionComponent, IconToolbarComponent, ResourceFormComponent, CategorySelectComponent,
    ReservationsAccordionComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceEditStore],
  styles: [` @media (width <= 600px) { ion-card { margin: 5px;} } `],
  template: `
    <bk-header title="{{ title() | translate | async }}" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-icon-toolbar icon="{{icon()}}" title="{{ toolbarTitle() }}"/>
      @if(isTypeEditable() === true && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onTypeChange($event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      @if(formData(); as formData) {
        <bk-resource-form
          [formData]="formData" 
          [currentUser]="currentUser()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          (formDataChange)="onFormDataChange($event)"
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
  public formData = linkedSignal(() => convertResourceToForm(this.resource()));

  // derived signals
  protected title = computed(() => getTitleLabel('resource', this.resource()?.bkey, this.isReadOnly()));
  protected toolbarTitle = computed(() => this.formData()?.name ?? DEFAULT_TITLE);
  protected readonly parentKey = computed(() => `${ResourceModelName}.${this.resourceKey()}`);
  protected currentUser = computed(() => this.resourceEditStore.currentUser());
  protected types = computed(() => this.resourceEditStore.appStore.getCategory(this.formData()?.type));
  protected type = computed(() => this.formData()?.type ?? DEFAULT_RESOURCE_TYPE);
  protected subTypes = computed(() => this.resourceEditStore.appStore.getCategory(this.formData()?.subType));
  protected usages = computed(() => this.resourceEditStore.appStore.getCategory(this.formData()?.usage));
  private rowingBoatIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('rboat_type', this.formData()?.subType));
  private resourceIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('resource_type', this.formData()?.type));
  protected icon = computed(() => this.formData()?.type === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());
  protected resource = computed(() => this.resourceEditStore.resource());
  protected tags = computed(() => this.resourceEditStore.getTags());

  constructor() {
    effect(() => {
      this.resourceEditStore.setResourceKey(this.resourceKey());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.resourceEditStore.save(this.formData());
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertResourceToForm(this.resource()));  // reset the form
  }

  protected onFormDataChange(formData: ResourceFormModel): void {
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

  protected onTypeChange(type: string): void {
    this.formDirty.set(true);
    this.formData.update((vm) => ({ ...vm, type } as ResourceFormModel));
  }
}
