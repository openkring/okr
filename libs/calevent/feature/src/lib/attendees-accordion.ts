import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, ModalController, ToastController } from '@ionic/angular/standalone';

import { Attendee, CalEventModel, MembershipModel, UserModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList } from '@bk2/shared-ui';
import { coerceBoolean, getAttendanceColor, getAttendanceIcon, isOngoing, isPerson } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { PersonSelectModal, PersonSelectResult } from '@bk2/shared-feature';
import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { CALEVENT_I18N_KEYS, CaleventI18n } from '@bk2/calevent-util';

import { AvatarPipe } from '@bk2/avatar-ui';

/**
 * An accordion component to display a list of attendees related to a specific CalEvent.
 * It shows the attendee information along with the status.
 * Users can subscribe or unsubscribe to the CalEvent.
 */
@Component({
  selector: 'bk-attendees-accordion',
  standalone: true,
  imports: [
    AvatarPipe, FullNamePipe, SvgIconPipe,
    EmptyList,
    IonAccordion, IonItem, IonLabel, IonList, IonImg, IonAvatar, IonIcon, IonButton
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="invitees">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ i18n.attendance_attendees() }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(attendees().length === 0) {
        <bk-empty-list [message]="i18n.attendance_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(attendee of attendees(); track $index) {
            <ion-item (click)="showActions(attendee)">
              <ion-icon slot="start" src="{{getAttendanceIcon(attendee.state) | svgIcon }}" color="{{getAttendanceColor(attendee.state)}}" />
              <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + attendee.person.key | avatar:'person' }}" alt="attendee avatar" />
              </ion-avatar>
              <ion-label>{{ attendee.person.name1| fullName: attendee.person.name2 }}</ion-label>
            </ion-item>
          }
        </ion-list>
        <ion-list lines="none">
          <ion-label>{{ acceptedCount()}}/{{attendees().length }} {{ i18n.attendance_accepted() }}</ion-label>
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class AttendeesAccordion {
  private actionSheetController = inject(ActionSheetController);
  private modalController = inject(ModalController);
  private toastController = inject(ToastController);
  private firestoreService = inject(FirestoreService);
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;
  private imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  // inputs
  public calevent = input.required<CalEventModel>();
  public currentUser = input<UserModel | undefined>();
  public tenantId = input<string>('');
  public readonly color = input('light');
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived field
  protected attendees = computed(() => this.calevent().attendees || []);
  protected acceptedCount = computed(() =>
    this.attendees().filter(inv => inv.state === 'accepted').length
  );

  /******************************* actions *************************************** */
  /**
   * Displays an ActionSheet with all possible actions on an Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param attendee 
   */
  protected async showActions(attendee: Attendee): Promise<void> {
    if (this.isReadOnly()) return;
    const actionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, attendee);
    await this.executeActions(actionSheetOptions, attendee);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param attendee 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, attendee: Attendee): void {
    if (attendee.state !== 'accepted') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.i18n.invitation_subscribe(), this.imgixBaseUrl, 'checkmark'));
    }
    if (attendee.state !== 'declined') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.i18n.invitation_unsubscribe(), this.imgixBaseUrl, 'cancel'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) { // only cancel button
      actionSheetOptions.buttons = [];
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param attendee 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, attendee: Attendee): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'calevent.subscribe':
          await this.changeState(attendee, 'accepted');
          break;
        case 'calevent.unsubscribe':
          await this.changeState(attendee, 'declined');
          break;
      }
    }
  }

  /******************************* helpers *************************************** */
  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  protected async add(): Promise<void> {
   const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    await modal.present();
    const { data: result, role } = await modal.onWillDismiss<PersonSelectResult>();
    const data = result?.kind === 'predefined' ? result.person : undefined;
    if (role === 'confirm') {
      if (isPerson(data, this.tenantId())) {
        const calevent = this.calevent();
        if (calevent.attendees.find(att => att.person.key === data.bkey)) {
          error(this.toastController, this.i18n.attendance_exists());
          return;
        }
        const attendee: Attendee = {
            person: {
                key: data.bkey,
                name1: data.firstName,
                name2: data.lastName,
                modelType: 'person',
                type: data.gender,
                subType: '',
                label: ''
            },
            state: 'accepted',
        };
        calevent.attendees.push(attendee);
        await this.firestoreService.updateModel<CalEventModel>('calevents', calevent, false, this.i18n.update_conf(), this.i18n.update_error(), this.currentUser());
      }
    }
  }

  private async changeState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    attendee.state = newState;
    const calevent = this.calevent();
    await this.firestoreService.updateModel<CalEventModel>('calevents', calevent, false, this.i18n.update_conf(), this.i18n.update_error(), this.currentUser());
  }

  protected getAttendanceIcon(state: string): string {
    return getAttendanceIcon(state);
  }

  protected getAttendanceColor(state: string): string {
    return getAttendanceColor(state);
  }
}
