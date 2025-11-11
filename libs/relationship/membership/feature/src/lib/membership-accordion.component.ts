import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, OrgModel, PersonModel, RoleName } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';
import { MembershipAccordionStore } from './membership-accordion.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-membership-accordion',
  standalone: true,
  imports: [
    TranslatePipe, DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList, IonImg, IonThumbnail
  ],
  providers: [MembershipAccordionStore],
  styles: [`
    ion-thumbnail { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="memberships">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('memberAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(memberships().length === 0) {
        <bk-empty-list message="@general.noData.memberships" />
      } @else {
        <ion-list lines="inset">
          @for(membership of memberships(); track $index) {
            <ion-item (click)="showActions(membership)">
              <ion-thumbnail slot="start">
                <ion-img src="{{ 'org.' + membership.orgKey | avatar | async}}" alt="membership avatar" />
              </ion-thumbnail>
              <ion-label>{{ membership.orgName }}</ion-label>
              <ion-label>{{ membership.relLog | categoryLog }} / {{ membership.dateOfEntry | duration:membership.dateOfExit }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class MembershipAccordionComponent {
  protected readonly membershipStore = inject(MembershipAccordionStore);
  private actionSheetController = inject(ActionSheetController);

  public member = input.required<PersonModel | OrgModel>();
  public modelType = input<'person' | 'org'>('person');
  public color = input('light');
  public title = input('@membership.plural');
  public membershipsChanged = output();

  protected memberships = computed(() => this.membershipStore.memberships());

  private imgixBaseUrl = this.membershipStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.membershipStore.setMember(this.member(), this.modelType()));
    effect(() => this.membershipStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membershipStore.add(this.member(), this.modelType());
  }

  /**
   * Displays an ActionSheet with all possible actions on a Membership. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param membership 
   */
  protected async showActions(membership: MembershipModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, membership);
    await this.executeActions(actionSheetOptions, membership);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param membership 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, membership: MembershipModel): void {
    if (hasRole('memberAdmin', this.membershipStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(membership.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('endMembership', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('changeMcat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.membershipStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.membershipStore.delete(membership);
          break;
        case 'edit':
          await this.membershipStore.edit(membership);
          break;
        case 'endMembership':
          await this.membershipStore.end(membership);
          break;
        case 'changeMcat':
          await this.membershipStore.changeMembershipCategory(membership);
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.membershipStore.currentUser());
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
