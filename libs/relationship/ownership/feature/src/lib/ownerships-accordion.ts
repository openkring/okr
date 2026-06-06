import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { OrgModel, OwnershipModel, PersonModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { getAvatarKey, getCategoryIcon, hasRole, isOngoing } from '@bk2/shared-util-core';

import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { OwnershipStore } from './ownership.store';

@Component({
  selector: 'bk-ownerships-accordion',
  standalone: true,
  imports: [
    DurationPipe, SvgIconPipe, EmptyList,
    IonAccordion, IonItem, IonLabel, IonList, IonButton, IonIcon, IonAvatar, IonImg
  ],
  providers: [OwnershipStore],
  styles: [`
      ion-avatar { width: 30px; height: 30px;  background-color: var(--ion-color-light);}
    `],
  template: `
    <ion-accordion toggle-icon-slot="start" value="ownerships">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() }}</ion-label>
        @if(!readOnly()) {
          <ion-button fill="clear" (click)="add()" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
          </ion-button>
        }
      </ion-item>
      <div slot="content">
        @if(ownerships().length === 0) {
          <bk-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list lines="inset">
            @for(ownership of ownerships(); track $index) {
              <ion-item (click)="showActions(ownership)">
                <ion-avatar slot="start">
                  <ion-img src="{{ getIcon(ownership.resourceType) | svgIcon }}" alt="Ownership Avatar Logo" />
                </ion-avatar>
                <ion-label>{{ownership.resourceName}}</ion-label>
                <ion-label>{{ ownership.validFrom | duration:ownership.validTo }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </div>
    </ion-accordion>
    `
})
export class OwnershipAccordion {
  protected readonly store = inject(OwnershipStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public owner = input.required<PersonModel | OrgModel>();
  public readonly ownerModelType = input<'person' | 'org'>('person');
  public readonly defaultResource = input<ResourceModel>();
  public readonly color = input('light');
  public readonly title = input(this.store.i18n.ownerships);
  public readonly readOnly = input(true);

  // derived fields
  protected ownerships = computed(() => this.store.ownerships());
  private readonly currentUser = computed(() => this.store.currentUser());
  protected readonly resourceTypes = this.store.appStore.getCategory('resource_type');

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setOwner(this.owner().bkey, this.ownerModelType()));
  }

  /******************************* getters *************************************** */
  // 20.0:key for a rowing boat, 20.4:key for a locker
  protected getAvatarKey(ownership: OwnershipModel): string {
    return getAvatarKey(ownership.resourceModelType, ownership.resourceKey, ownership.resourceType, ownership.resourceSubType);
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    const resource = this.defaultResource();
    if (resource) {
      await this.store.add(this.owner(), this.ownerModelType(), resource, this.readOnly());
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Ownership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param ownership 
   */
  protected async showActions(ownership: OwnershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, ownership);
    await this.executeActions(actionSheetOptions, ownership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param ownership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, ownership: OwnershipModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('ownership.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(ownership.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('ownership.end', this.store.i18n.end(), this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.currentUser()) && !this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('ownership.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param ownership 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, ownership: OwnershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'ownership.delete':
          await this.store.delete(ownership, this.readOnly());
          break;
        case 'ownership.edit':
          await this.store.edit(ownership, this.readOnly());
          break;
        case 'ownership.view':
          await this.store.edit(ownership, true);
          break;
        case 'ownership.end':
          await this.store.end(ownership, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  protected getIcon(resourceType: string): string {
    return getCategoryIcon(this.resourceTypes, resourceType);
  }
}
