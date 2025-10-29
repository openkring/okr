import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { ResourceTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, OrgModel, OwnershipModel, PersonModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { getAvatarKey, hasRole, isOngoing } from '@bk2/shared-util-core';
import { OwnershipAccordionStore } from './ownerships-accordion.store';

import { AvatarPipe } from '@bk2/avatar-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-ownerships-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AvatarPipe, AsyncPipe, DurationPipe, SvgIconPipe, EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonList, IonButton, IonIcon, IonThumbnail, IonImg
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
              <ion-item (click)="showActions(ownership)">
                <ion-thumbnail slot="start">
                  <ion-img [src]="getAvatarKey(ownership) | avatar | async" alt="resource avatar" />
                </ion-thumbnail>
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
export class OwnershipAccordionComponent {
  private readonly ownershipStore = inject(OwnershipAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public owner = input.required<PersonModel | OrgModel>();
  public ownerModelType = input<ModelType>(ModelType.Person);
  public defaultResource = input<ResourceModel>();
  public color = input('light');
  public title = input('@ownership.plural');

  protected ownerships = computed(() => this.ownershipStore.ownerships());

  protected modelType = ModelType;
  protected resourceTypes = ResourceTypes;
  private imgixBaseUrl = this.ownershipStore.appStore.env.services.imgixBaseUrl;

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
    const resource = this.defaultResource();
    if (resource) {
      await this.ownershipStore.add(this.owner(), this.ownerModelType(), resource);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Ownership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param ownership 
   */
  protected async showActions(ownership: OwnershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, ownership);
    await this.executeActions(actionSheetOptions, ownership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param ownership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, ownership: OwnershipModel): void {
    if (hasRole('resourceAdmin', this.ownershipStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(ownership.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endownership', this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.ownershipStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.ownershipStore.delete(ownership);
          break;
        case 'edit':
          await this.ownershipStore.edit(ownership);
          break;
        case 'endownership':
          await this.ownershipStore.end(ownership);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.ownershipStore.currentUser());
  }
}
