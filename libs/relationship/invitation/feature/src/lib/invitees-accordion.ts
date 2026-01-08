import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';


import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CalEventModel, InvitationModel, MembershipModel } from '@bk2/shared-models';
import { FullNamePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole, isOngoing } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { InvitationStore } from 'libs/relationship/invitation/feature/src/lib/invitation.store';

/**
 * An accordion component to display a list of invitations related to a specific CalEvent.
 * It shows the invitee information along with the invitation status.
 * Users can accept or deny new invitations or manage existing ones through action sheets.
 */
@Component({
  selector: 'bk-invitees-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, PrettyDatePipe, FullNamePipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList, IonImg, IonAvatar
  ],
  providers: [InvitationStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="invitees">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(invitees().length === 0) {
        <bk-empty-list message="@general.noData.invitations" />
      } @else {
        <ion-list lines="inset">
          @for(invitee of invitees(); track $index) {
            <ion-item (click)="showActions(invitee)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + invitee.inviteeKey | avatar:'person' | async}}" alt="invitation avatar" />
              </ion-avatar>
              <ion-label>{{ invitee.inviteeFirstName | fullName: invitee.inviteeLastName }}</ion-label>
              <ion-label>{{ invitee.state }}</ion-label>
              <ion-label>{{ invitee.respondedAt | prettyDate }} </ion-label>
            </ion-item>
          }
        </ion-list>
        <ion-list lines="none">
          <ion-label>{{ acceptedCount()}}/{{invitees().length }} {{ '@invitation.accepted' | translate | async }}</ion-label>
        </ion-list>
      } 
    </div>
  </ion-accordion>
  `,
})
export class InviteesAccordionComponent {
  protected readonly invitationStore = inject(InvitationStore);
  private actionSheetController = inject(ActionSheetController);

  // inputs
  public calevent = input.required<CalEventModel>();
  public readonly color = input('light');
  public readonly title = input('@invitation.plural');
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected invitees = computed(() => this.invitationStore.invitees());
  private currentUser = computed(() => this.invitationStore.currentUser());
  protected acceptedCount = computed(() => 
    this.invitees().filter(inv => inv.state === 'accepted').length
  );
  private imgixBaseUrl = this.invitationStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.invitationStore.setCalevent(this.calevent().bkey));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.invitationStore.invitePerson(this.calevent(), this.isReadOnly());
  }

  /**
   * Displays an ActionSheet with all possible actions on an Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param invitation 
   */
  protected async showActions(invitation: InvitationModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, invitation);
    await this.executeActions(actionSheetOptions, invitation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param invitation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, invitation: InvitationModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('invitation.view', this.imgixBaseUrl, 'eye-on'));
    // users can change the invitation state of their own invitations
    if (invitation.inviteeKey === this.currentUser()?.personKey) {
      if (invitation.state !== 'accepted') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.accept', this.imgixBaseUrl, 'checkmark'));
      }
      if (invitation.state !== 'declined') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.decline', this.imgixBaseUrl, 'close_cancel'));
      }
      if (invitation.state !== 'maybe') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.maybe', this.imgixBaseUrl, 'help'));
      }
    }
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.edit', this.imgixBaseUrl, 'create_edit'));
    }
    if (hasRole('admin', this.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.delete', this.imgixBaseUrl, 'trash_delete'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param invitation 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, invitation: InvitationModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'invitation.delete':
          await this.invitationStore.delete(invitation, this.isReadOnly());
          break;
        case 'invitation.edit':
          await this.invitationStore.edit(invitation, this.isReadOnly());
          break;
        case 'invitation.view':
          await this.invitationStore.edit(invitation, true);
          break;
        case 'invitation.accept':
          await this.invitationStore.changeState(invitation, 'accepted');
          break;
        case 'invitation.decline':
          await this.invitationStore.changeState(invitation, 'declined');
          break;
        case 'invitation.maybe':
          await this.invitationStore.changeState(invitation, 'maybe');
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
