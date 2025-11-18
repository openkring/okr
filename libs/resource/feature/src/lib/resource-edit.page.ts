import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ResourceCollection, RoleName } from '@bk2/shared-models';
import { CategorySelectComponent, ChangeConfirmationComponent, HeaderComponent, IconToolbarComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { ResourceFormComponent } from '@bk2/resource-ui';
import { convertResourceToForm, isReservable } from '@bk2/resource-util';
import { ResourceEditStore } from './resource-edit.store';
import { DEFAULT_RESOURCE_TYPE } from '@bk2/shared-constants';

@Component({
  selector: 'bk-resource-edit-page',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent,
    CommentsAccordionComponent, IconToolbarComponent, ResourceFormComponent, CategorySelectComponent,
    TranslatePipe, AsyncPipe,
    IonContent, IonAccordionGroup, IonGrid, IonRow, IonCol
  ],
  providers: [ResourceEditStore],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" />
    @if(formIsValid()) {
      <bk-change-confirmation (okClicked)="save()" />
    }
    <ion-content>
      <bk-icon-toolbar icon="{{icon()}}" title="{{ title() }}"/>
      @if(isTypeEditable() === true && types()) {
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-cat-select [category]="types()!" [selectedItemName]="type()" [withAll]="false" [readOnly]="readOnly()" (changed)="onTypeChange($event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      }
      @if(resource(); as resource) {
        <bk-resource-form [(vm)]="vm" 
          [currentUser]="currentUser()"
          [types]="types()"
          [subTypes]="subTypes()"
          [usages]="usages()"
          [allTags]="tags()"
          (validChange)="formIsValid.set($event)"
        />
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
  protected types = computed(() => this.resourceEditStore.appStore.getCategory(this.vm().type));
  protected type = computed(() => this.vm().type ?? DEFAULT_RESOURCE_TYPE);
  protected subTypes = computed(() => this.resourceEditStore.appStore.getCategory(this.vm().subType));
  protected usages = computed(() => this.resourceEditStore.appStore.getCategory(this.vm().usage));
  protected readonly readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  private rowingBoatIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('rboat_type', this.vm().subType));
  private resourceIcon = computed(() => this.resourceEditStore.appStore.getCategoryIcon('resource_type', this.vm().type));
  protected icon = computed(() => this.vm().type === 'rboat' ? this.rowingBoatIcon() : this.resourceIcon());

  protected resource = computed(() => this.resourceEditStore.resource());
  protected title = computed(() => `${this.vm()?.name}`);
  protected tags = computed(() => this.resourceEditStore.getTags());

  protected formIsValid = signal(false);
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

  protected isReservable(resourceType?: string): boolean {
    if (!resourceType || resourceType.length === 0) return false;
    return isReservable(resourceType);
  }

  protected onTypeChange($event: string): void {
    this.vm.update((vm) => ({ ...vm, type: $event }));
  }
}
