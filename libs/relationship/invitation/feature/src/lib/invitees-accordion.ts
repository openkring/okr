import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, AlertController, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { CalEventModel, InvitationModel, InvitationState, MembershipModel } from '@okr/shared-models';
import { FullNamePipe, PrettyDateTimePipe, SvgIconPipe } from '@okr/shared-pipes';
import { CountPill, EmptyList } from '@okr/shared-ui';
import { coerceBoolean, hasRole, isOngoing } from '@okr/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, notify } from '@okr/shared-util-angular';

import { AvatarPipe } from '@okr/avatar-ui';

import { InvitationStore } from './invitation.store';

/**
 * An accordion component to display a list of invitations related to a specific CalEvent.
 * It shows the invitee information along with the invitation status.
 * Users can accept or deny new invitations or manage existing ones through action sheets.
 */
@Component({
  selector: 'okr-invitees-accordion',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarPipe, PrettyDateTimePipe, FullNamePipe,
    EmptyList, CountPill,
    IonAccordion, IonItem, IonLabel, IonButton, IonIcon, IonList, IonImg, IonAvatar
  ],
  providers: [InvitationStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .responded { font-size: 0.75em; color: var(--ion-color-medium); }
    .header-icon {
      font-size: 20px;
      color: var(--ion-color-medium);
      margin-inline-end: 10px;
    }
    /* Ionic sets .accordion-expanded on the host while the accordion is open. */
    ion-accordion.accordion-expanded .header-icon { color: var(--ion-color-primary); }
    ion-accordion.accordion-expanded ion-label { color: var(--ion-color-primary-shade); font-weight: 600; }
    ion-accordion.accordion-expanded okr-count-pill {
      --okr-pill-background: var(--ion-color-primary-tint);
      --okr-pill-color: var(--ion-color-primary-shade);
    }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="invitees">
    <ion-item slot="header" [color]="color()">
      <ion-icon class="header-icon" src="{{ 'people' | svgIcon }}" />
      <ion-label>{{ accordionTitle() }}</ion-label>
      <okr-count-pill slot="end" [count]="invitees().length" />
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(invitees().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for(invitee of invitees(); track $index) {
            <ion-item (click)="showActions(invitee)">
              <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + invitee.inviteeKey | avatar:'person' }}" alt="invitation avatar" />
              </ion-avatar>
              <ion-label>
                {{ invitee.inviteeFirstName | fullName: invitee.inviteeLastName }}
                <!-- the response timestamp is the list's sort key: it belongs next to the name it
                     orders, small enough not to compete with it -->
                <div class="responded">{{ invitee.respondedAt | prettyDateTime }}</div>
              </ion-label>
              <ion-label>{{ getStateLabel(invitee.state) }}</ion-label>
              @if(invitee.isLocked) {
                <ion-icon slot="end" color="medium" src="{{'lock-closed' | svgIcon }}" />
              }
            </ion-item>
          }
        </ion-list>
        <ion-list lines="none">
          <ion-label>{{ acceptedCount()}}/{{invitees().length }} {{ store.i18n.accepted() }}</ion-label>
        </ion-list>
      } 
    </div>
  </ion-accordion>
  `,
})
export class InviteesAccordion {
  protected readonly store = inject(InvitationStore);
  private actionSheetController = inject(ActionSheetController);
  private alertController = inject(AlertController);

  // inputs
  public calevent = input.required<CalEventModel>();
  public readonly color = input('light');
  public readonly title = input<string | undefined>();
  public showOnlyCurrent = input<boolean>(true);
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected invitees = computed(() => this.store.invitees());
  private currentUser = computed(() => this.store.currentUser());
  protected accordionTitle = computed(() => this.title() ?? this.store.i18n.invitations());
  protected acceptedCount = computed(() => 
    this.invitees().filter(inv => inv.state === 'accepted').length
  );
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setScope(this.calevent().okey, '', this.showOnlyCurrent()));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.store.invitePerson(this.calevent(), this.isReadOnly());
  }

  protected getStateLabel(state: InvitationState): string {
    switch(state) {
      case 'pending':   return this.store.i18n.state_pending_label();
      case 'accepted':  return this.store.i18n.state_accepted_label();
      case 'maybe':     return this.store.i18n.state_maybe_label();
      case 'declined':  return this.store.i18n.state_declined_label();
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on an Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param invitation 
   */
  protected async showActions(invitation: InvitationModel): Promise<void> {
    // a non-admin may only act on their own invitation, not on other people's rows
    if (!this.isOwnInvitation(invitation) && !hasRole('admin', this.currentUser())) return;
    // an invitee tapping their own locked row gets told why, instead of a sheet with every answer
    // silently missing from it. Organisers/admins keep the full sheet — the lock is theirs to lift.
    if (invitation.isLocked && this.isReadOnly() && !hasRole('admin', this.currentUser())) {
      await notify(this.alertController, this.store.i18n.locked_title(), this.store.i18n.locked_hint(), this.store.i18n.ok());
      return;
    }
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, invitation);
    await this.executeActions(actionSheetOptions, invitation);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param invitation 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, invitation: InvitationModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('invitation.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    // users can change the invitation state of their own invitations — unless the organiser
    // locked the responses, in which case only the read actions remain
    if (this.isOwnInvitation(invitation) && !invitation.isLocked) {
      if (invitation.state !== 'accepted') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.accept', this.store.i18n.accept(), this.imgixBaseUrl, 'checkmark'));
      }
      if (invitation.state !== 'declined') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.decline', this.store.i18n.decline(), this.imgixBaseUrl, 'cancel'));
      }
      if (invitation.state !== 'maybe') {
        actionSheetOptions.buttons.push(createActionSheetButton('invitation.maybe', this.store.i18n.maybe(), this.imgixBaseUrl, 'help'));
      }
    }
    if (!this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.currentUser()) && !this.isReadOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('invitation.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
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
          await this.store.delete(invitation, this.isReadOnly());
          break;
        case 'invitation.edit':
          await this.store.edit(invitation, this.isReadOnly());
          break;
        case 'invitation.view':
          await this.store.edit(invitation, true);
          break;
        case 'invitation.accept':
          await this.store.changeState(invitation, 'accepted');
          break;
        case 'invitation.decline':
          await this.store.changeState(invitation, 'declined');
          break;
        case 'invitation.maybe':
          await this.store.changeState(invitation, 'maybe');
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  private isOwnInvitation(invitation: InvitationModel): boolean {
    return invitation.inviteeKey === this.currentUser()?.personKey;
  }

  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }
}
