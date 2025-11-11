import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { MembersAccordionStore } from './members-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-members-accordion',
  standalone: true,
  imports: [
    TranslatePipe, DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, FullNamePipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton, IonImg, IonThumbnail
  ],
  providers: [MembersAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="members">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('memberAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(members().length === 0) {
        <bk-empty-list message="@general.noData.members" />
      } @else {
        <ion-list lines="inset">
          @for(member of members(); track $index) {
              <ion-item (click)="showActions(member)">
                <ion-thumbnail slot="start">
                  <ion-img src="{{ 'person.' + member.memberKey | avatar | async}}" alt="membership avatar" />
                </ion-thumbnail>
                <ion-label>{{member.memberName1 | fullName:member.memberName2}}</ion-label>      
                <ion-label>{{ member.relLog | categoryLog }} / {{ member.dateOfEntry | duration:member.dateOfExit }}</ion-label>
              </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class MembersAccordionComponent {
  protected readonly membersStore = inject(MembersAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public orgKey = input.required<string>();
  public color = input('light');
  public title = input('@members.plural');

  protected members = computed(() => this.membersStore.members());

  private imgixBaseUrl = this.membersStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.membersStore.setOrgKey(this.orgKey()));
    effect(() => this.membersStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membersStore.addMember();
  }

 /**
   * Displays an ActionSheet with all possible actions on a Member. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param member 
   */
  protected async showActions(member: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, member);
    await this.executeActions(actionSheetOptions, member);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param member 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, member: MembershipModel): void {
    if (hasRole('memberAdmin', this.membersStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(member.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endMembership', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('changeMcat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.membersStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param member 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, member: MembershipModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      switch (data.action) {
        case 'delete':
          await this.membersStore.delete(member);
          break;
        case 'edit':
          await this.membersStore.edit(member);
          break;
        case 'endMembership':
          await this.membersStore.end(member);
          break;
        case 'changeMcat':
          await this.membersStore.changeMembershipCategory(member);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.membersStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
