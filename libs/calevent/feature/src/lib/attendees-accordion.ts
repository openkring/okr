import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, ModalController, ToastController } from '@ionic/angular/standalone';


import { AvatarPipe } from '@bk2/avatar-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { Attendee, CalEventModel, MembershipModel } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, getAttendanceColor, getAttendanceIcon, isOngoing, isPerson } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';

/**
 * An accordion component to display a list of invitations related to a specific CalEvent.
 * It shows the invitee information along with the invitation status.
 * Users can accept or deny new invitations or manage existing ones through action sheets.
 */
@Component({
  selector: 'bk-attendees-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, AvatarPipe, FullNamePipe, SvgIconPipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonList, IonImg, IonAvatar, IonIcon, IonButton
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
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
        @if(attendees().length === 0) {
        <bk-empty-list message="@general.noData.attendance" />
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
          <ion-label>{{ acceptedCount()}}/{{attendees().length }} {{ '@calevent.field.attendance.accepted' | translate | async }}</ion-label>
        </ion-list>
      } 
    </div>
  </ion-accordion>
  `,
})
export class AttendeesAccordionComponent {
  private actionSheetController = inject(ActionSheetController);
  private appStore = inject(AppStore);
  private modalController = inject(ModalController);
  private toastController = inject(ToastController);

  // inputs
  public calevent = input.required<CalEventModel>();
  public readonly color = input('light');
  public readonly title = input('@calevent.field.attendance.plural');
  public readonly readOnly = input<boolean>(true);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived field
  protected attendees = computed(() => this.calevent().attendees || []);
  private currentUser = computed(() => this.appStore.currentUser());
  protected acceptedCount = computed(() => 
    this.attendees().filter(inv => inv.state === 'accepted').length
  );
  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  /**
   * Displays an ActionSheet with all possible actions on an Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param attendee 
   */
  protected async showActions(attendee: Attendee): Promise<void> {
    if (this.isReadOnly()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, attendee);
    await this.executeActions(actionSheetOptions, attendee);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param attendee 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, attendee: Attendee): void {
    if (attendee.state !== 'accepted') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.subscribe', this.imgixBaseUrl, 'checkmark'));
    }
    if (attendee.state !== 'declined') {
    actionSheetOptions.buttons.push(createActionSheetButton('calevent.unsubscribe', this.imgixBaseUrl, 'close_cancel'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.currentUser()
      }
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.tenantId())) {
        const calevent = this.calevent();
        if (calevent.attendees.find(att => att.person.key === data.bkey)) {
          error(this.toastController, '@calevent.field.attendance.exists');
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
        await this.appStore.firestoreService.updateModel<CalEventModel>('calevents', calevent, false, '@calevent.operation.update', this.currentUser());
      }
    }
}

  private async changeState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    attendee.state = newState;
    const calevent = this.calevent();
    await this.appStore.firestoreService.updateModel<CalEventModel>('calevents', calevent, false, '@calevent.operation.update', this.currentUser());
  }

  protected getAttendanceIcon(state: string): string {
    return getAttendanceIcon(state);
  }

  protected getAttendanceColor(state: string): string {
    return getAttendanceColor(state);
  }
}
