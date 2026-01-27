import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { CategoryLogPipe } from '@bk2/relationship-membership-util';

import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { DurationPipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isOngoing } from '@bk2/shared-util-core';
import { MembershipStore } from './membership.store';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-membership-accordion',
  standalone: true,
  imports: [
    TranslatePipe, DurationPipe, AsyncPipe, SvgIconPipe, CategoryLogPipe, AvatarPipe, EmptyListComponent,
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
        <bk-empty-list message="@general.noData.memberships" />
      } @else {
        <ion-list lines="inset">
          @for(membership of memberships(); track $index) {
            <ion-item (click)="showActions(membership)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'org.' + membership.orgKey | avatar:'membership' }}" alt="Membership Avatar Logo" />
              </ion-avatar>
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
  protected readonly membershipStore = inject(MembershipStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public member = input.required<PersonModel | OrgModel>();
  public readonly modelType = input<'person' | 'org'>('person');
  public readonly color = input('light');
  public readonly title = input('@membership.plural');
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected memberships = computed(() => this.membershipStore.memberships());
  private currentUser = computed(() => this.membershipStore.currentUser());
  private showOnlyCurrent = computed(() => hasRole('admin', this.currentUser())); // admins also see past memberships

  private imgixBaseUrl = this.membershipStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => { 
      this.membershipStore.setMember(this.member(), this.modelType()),
      this.membershipStore.setOrgId();
      this.membershipStore.setShowMode(this.showOnlyCurrent());
    });
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.membershipStore.add(this.isReadOnly());
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
    actionSheetOptions.buttons.push(createActionSheetButton('membership.view', this.imgixBaseUrl, 'eye-on'));
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'create_edit'));
      if (isOngoing(membership.dateOfExit)) {
        actionSheetOptions.buttons.push(createActionSheetButton('membership.end', this.imgixBaseUrl, 'stop-circle'));
        actionSheetOptions.buttons.push(createActionSheetButton('membership.changecat', this.imgixBaseUrl, 'member_change'));
      }
    }
    if (hasRole('admin', this.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('membership.delete', this.imgixBaseUrl, 'trash_delete'));
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
      if (!data) return;
      switch (data.action) {
        case 'membership.delete':
          await this.membershipStore.delete(membership, this.isReadOnly());
          break;
        case 'membership.edit':
          await this.membershipStore.edit(membership, this.isReadOnly());
          break;
        case 'membership.view':
          await this.membershipStore.edit(membership, true);
          break;
        case 'membership.end':
          await this.membershipStore.end(membership, undefined, this.isReadOnly());
          break;
        case 'membership.changecat':
          await this.membershipStore.changeMembershipCategory(membership, this.isReadOnly());
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
