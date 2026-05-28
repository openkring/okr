import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { RellogPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-membership-accordion',
  standalone: true,
  imports: [
    TranslatePipe, RellogPipe, AsyncPipe, SvgIconPipe, AvatarPipe, EmptyList,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList, IonImg, IonAvatar
  ],
  providers: [MembershipStore],
  styles: [`
      ion-avatar { width: 30px; height: 30px;  background-color: var(--ion-color-light);}
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="memberships">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(memberships().length === 0) {
        <bk-empty-list [message]="store.i18n.no_data_memberships()" />
      } @else {
        <ion-list lines="inset">
          @for(membership of memberships(); track $index) {
            <ion-item (click)="showActions(membership)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'org.' + membership.orgKey | avatar:'membership' }}" alt="Membership Avatar Logo" />
              </ion-avatar>
              <ion-label>{{ membership.orgName }}</ion-label>
              <ion-label>{{ membership.relLog | rellog }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class MembershipAccordion {
  protected readonly store = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public member = input.required<PersonModel | OrgModel>();
  public readonly modelType = input<'person' | 'org'>('person');
  public readonly color = input('light');
  public readonly title = input(this.store.i18n.memberships());
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected memberships = computed(() => this.store.memberships());
  private currentUser = computed(() => this.store.currentUser());
  private maySeeOldMemberships = computed(() => hasRole('privileged', this.currentUser()) || hasRole('memberAdmin', this.currentUser()));
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => { 
      this.store.setMember(this.member(), this.modelType()),
      this.store.setOrgId();
      this.store.setShowMode(!this.maySeeOldMemberships());
    });
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.add(this.isReadOnly());
  }

  /**
   * Displays an ActionSheet with all possible actions on a Membership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param membership 
   */
  protected async showActions(membership: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, membership);
    await this.executeActions(actionSheetOptions, membership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param membership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.store.i18n.view_label(), this.imgixBaseUrl, 'eye-on'));
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.store.i18n.update_label(), this.imgixBaseUrl, 'edit'));
      if (isOngoing(membership.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.store.i18n.end_label(), this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.store.i18n.category_change_label(), this.imgixBaseUrl, 'mcatchange'));
      }
    }
    if (hasRole('admin', this.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.store.i18n.delete_label(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param membership 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'membership.delete':
          await this.store.delete(membership, this.isReadOnly());
          break;
        case 'membership.edit':
          await this.store.edit(membership, this.isReadOnly());
          break;
        case 'membership.view':
          await this.store.edit(membership, true);
          break;
        case 'membership.end':
          await this.store.end(membership, undefined, this.isReadOnly());
          break;
        case 'membership.changecat':
          await this.store.changeMembershipCategory(membership, this.isReadOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
