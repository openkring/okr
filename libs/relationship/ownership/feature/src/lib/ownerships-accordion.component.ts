import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, OwnershipModel, PersonModel, ReservationModel, ResourceModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { getAvatarKey, getCategoryIcon, getItemLabel, hasRole, isOngoing } from '@bk2/shared-util-core';
import { OwnershipAccordionStore } from './ownerships-accordion.store';

import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-ownerships-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, DurationPipe, SvgIconPipe, EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonList, IonButton, IonIcon, IonAvatar, IonImg
  ],
  providers: [OwnershipAccordionStore],
  styles: [`
      ion-avatar { width: 30px; height: 30px; }
    `],
  template: `
    <ion-accordion toggle-icon-slot="start" value="ownerships">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ title() | translate | async }}</ion-label>
        @if(hasRole('resourceAdmin') && !readOnly()) {
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
                <ion-avatar slot="start">
                  <ion-img src="{{ getIcon(ownership.resourceType) | svgIcon }}" alt="Avatar Logo" />
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
export class OwnershipAccordionComponent {
  private readonly ownershipStore = inject(OwnershipAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public owner = input.required<PersonModel | OrgModel>();
  public readonly ownerModelType = input<'person' | 'org'>('person');
  public readonly defaultResource = input<ResourceModel>();
  public readonly color = input('light');
  public readonly title = input('@ownership.plural');
  public readonly readOnly = input(true);

  protected ownerships = computed(() => this.ownershipStore.ownerships());
  private readonly currentUser = computed(() => this.ownershipStore.currentUser());
  protected readonly resourceTypes = this.ownershipStore.appStore.getCategory('resource_type');

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
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(ownership.validTo)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endownership', this.imgixBaseUrl, 'stop-circle'));
      }
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl, 'eye-on'));
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
      if (!data) return;
      switch (data.action) {
        case 'delete':
          await this.ownershipStore.delete(ownership, this.readOnly());
          break;
        case 'edit':
          await this.ownershipStore.edit(ownership, this.readOnly());
          break;
        case 'view':
          await this.ownershipStore.edit(ownership, true);
          break;
        case 'endownership':
          await this.ownershipStore.end(ownership, this.readOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.ownershipStore.currentUser());
  }

  protected getIcon(resourceType: string): string {
    return getCategoryIcon(this.resourceTypes, resourceType);
  }
}
