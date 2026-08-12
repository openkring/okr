import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, ModalController, ToastController } from '@ionic/angular/standalone';

import { Attendee, CalEventModel, MembershipModel, UserModel } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList } from '@okr/shared-ui';
import { coerceBoolean, getAttendanceColor, getAttendanceIcon, isOngoing, isPerson } from '@okr/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CALEVENT_I18N_KEYS, CaleventI18n, isPastCalevent } from '@okr/calevent-util';

import { AvatarPipe } from '@okr/avatar-ui';

/**
 * An accordion component to display a list of attendees related to a specific CalEvent.
 * It shows the attendee information along with the status.
 * Users can subscribe or unsubscribe to the CalEvent.
 */
@Component({
  selector: 'okr-attendees-accordion',
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
        <okr-empty-list [message]="i18n.attendance_empty()" />
      } @else {
        <ion-list lines="inset">
          @for(attendee of attendees(); track $index) {
            <ion-item (click)="showActions(attendee)">
              <ion-icon slot="start" src="{{getAttendanceIcon(attendee.state) | svgIcon }}" color="{{getAttendanceColor(attendee.state)}}" />
              <ion-avatar slot="start">
                <ion-img src="{{ 'person.' + attendee.person.key | avatar:'person' }}" alt="attendee avatar" />
              </ion-avatar>
              <ion-label>{{ attendee.person.name1| fullName: attendee.person.name2 }}</ion-label>
              @if(!isReadOnly()) {
                <ion-icon slot="end" color="danger" src="{{'cancel' | svgIcon }}" (click)="remove(attendee, $event)" />
              }
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
  // linkedSignal, not computed: add()/changeState() must publish a NEW array through a signal.
  // Mutating calevent().attendees in place changed the rendered length between the change-detection
  // and the verification pass -> NG0100 (ExpressionChangedAfterItHasBeenChecked).
  protected attendees = linkedSignal(() => this.calevent().attendees || []);
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
    // attendance can no longer be changed for past events
    if (this.isReadOnly() || isPastCalevent(this.calevent())) return;
    const actionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, attendee);
    await this.executeActions(actionSheetOptions, attendee);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param attendee 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, attendee: Attendee): void {
    // first person for my own attendance, third person when the organiser changes someone else's
    const isMe = attendee.person.key === this.currentUser()?.personKey;
    const subscribe = isMe ? this.i18n.invitation_subscribe() : this.i18n.attendance_subscribe();
    const unsubscribe = isMe ? this.i18n.invitation_unsubscribe() : this.i18n.attendance_unsubscribe();
    if (attendee.state !== 'accepted') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', subscribe, this.imgixBaseUrl, 'checkmark'));
    }
    if (attendee.state !== 'declined') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', unsubscribe, this.imgixBaseUrl, 'cancel'));
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
      if (data && isPerson(data, this.tenantId())) {
        if (this.attendees().some(att => att.person.key === data.okey)) {
          error(this.toastController, this.i18n.attendance_exists());
          return;
        }
        const attendee: Attendee = {
            person: {
                key: data.okey,
                name1: data.firstName,
                name2: data.lastName,
                modelType: 'person',
                type: data.gender,
                subType: '',
                label: ''
            },
            state: 'accepted',
        };
        await this.saveAttendees([...this.attendees(), attendee]);
      }
    }
  }

  private async changeState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    await this.saveAttendees(this.attendees().map(a => a === attendee ? { ...a, state: newState } : a));
  }

  /** Removes the attendee from the calevent (organiser/admin only). */
  protected async remove(attendee: Attendee, event: Event): Promise<void> {
    event.stopPropagation();   // do not open the attendance ActionSheet of the row
    if (this.isReadOnly()) return;
    await this.saveAttendees(this.attendees().filter(a => a !== attendee));
  }

  /** Publishes the new attendee list to the template, the shared calevent object (the parent form saves it) and Firestore. */
  private async saveAttendees(attendees: Attendee[]): Promise<void> {
    const calevent = this.calevent();
    calevent.attendees = attendees;
    this.attendees.set(attendees);
    await this.firestoreService.updateModel<CalEventModel>('calevents', calevent, false, this.i18n.update_conf(), this.i18n.update_error(), this.currentUser());
  }

  protected getAttendanceIcon(state: string): string {
    return getAttendanceIcon(state);
  }

  protected getAttendanceColor(state: string): string {
    return getAttendanceColor(state);
  }
}
