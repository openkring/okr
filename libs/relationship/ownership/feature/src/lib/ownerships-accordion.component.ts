import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, DurationPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { RoleName } from '@bk2/shared/config';
import { getAvatarKey, hasRole } from '@bk2/shared/util';
import { ModelType, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared/models';
import { ResourceTypes } from '@bk2/shared/categories';
import { OwnershipAccordionStore } from './ownerships-accordion.store';
import { EmptyListComponent } from '@bk2/shared/ui';

@Component({
    selector: 'bk-ownerships-accordion',
    imports: [
      TranslatePipe, AvatarPipe, AsyncPipe, DurationPipe, SvgIconPipe, EmptyListComponent,
      IonAccordion, IonItem, IonLabel, IonList, IonButton, IonIcon,
      IonThumbnail, IonImg, IonItemSliding, IonItemOptions, IonItemOption
    ],
    providers: [OwnershipAccordionStore],
    styles: [`
      ion-thumbnail { width: 30px; height: 30px; }
    `],
    template: `
    <ion-accordion toggle-icon-slot="start" value="ownerships">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
        @if(hasRole('resourceAdmin')) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
          </ion-button>
        }
      </ion-item>
      <div slot="content">
        @if(ownerships().length === 0) {
          <bk-empty-list message="@general.noData.ownerships" />
        } @else {
          <ion-list lines="inset">
            @for(ownership of ownerships(); track $index) {
              <ion-item-sliding #slidingItem>
                <ion-item (click)="edit(undefined, ownership)">
                  <ion-thumbnail slot="start">
                    <ion-img [src]="getAvatarKey(ownership) | avatar | async" alt="resource avatar" />
                  </ion-thumbnail>
                  <ion-label>{{ownership.resourceName}}</ion-label>
                  <ion-label>{{ ownership.validFrom | duration:ownership.validTo }}</ion-label>
                </ion-item>
                @if(hasRole('resourceAdmin')) {
                  <ion-item-options side="end">
                    <ion-item-option color="danger" (click)="delete(slidingItem, ownership)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                    <ion-item-option color="warning" (click)="end(slidingItem, ownership)">
                      <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                    </ion-item-option>
                    <ion-item-option color="primary" (click)="edit(slidingItem, ownership)">
                      <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                    </ion-item-option>
                  </ion-item-options>
                }
              </ion-item-sliding>
            }
          </ion-list>
        }
      </div>
    </ion-accordion>
    `
})
export class OwnershipAccordionComponent {
  private readonly ownershipStore = inject(OwnershipAccordionStore);
  
  public owner = input.required<PersonModel | OrgModel>();
  public ownerModelType = input<ModelType>(ModelType.Person);
  public defaultResource = input<ResourceModel>();
  public color = input('light');
  public title = input('@ownership.plural');
  
  protected ownerships = computed(() => this.ownershipStore.ownerships());

  protected modelType = ModelType;
  protected resourceTypes = ResourceTypes;

  constructor() {
    effect(() => this.ownershipStore.setOwner(this.owner(), this.ownerModelType()));
  }

  /******************************* getters *************************************** */
  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(ownership: OwnershipModel): string {
    return getAvatarKey(ownership.resourceModelType, ownership.resourceKey, ownership.resourceType, ownership.resourceSubType);
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    const _resource = this.defaultResource();
    if (_resource) {
      await this.ownershipStore.add(this.owner(), this.ownerModelType(), _resource);
    }
  }

  protected async edit(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (ownership) await this.ownershipStore.edit(ownership);
  }

  public async delete(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (ownership) await this.ownershipStore.delete(ownership);
  }

  public async end(slidingItem?: IonItemSliding, ownership?: OwnershipModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (ownership) await this.ownershipStore.end(ownership);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.ownershipStore.currentUser());
  }
}
