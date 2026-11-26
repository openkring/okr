import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonAvatar, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote, ModalController, ToastController } from '@ionic/angular';

import { Attendee, CalEventModel, InvitationCollection, InvitationModel, MembershipModel, UserModel } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { CountPill, EmptyList, ImgDirective } from '@okr/shared-ui';
import { coerceBoolean, fill, getAttendanceColor, getAttendanceIcon, getAvatarInfoForCurrentUser, getSystemQuery, isOngoing, isPerson } from '@okr/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { PersonSelectModal, PersonSelectResult } from '@okr/shared-feature';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { InvitationService } from '@okr/relationship-invitation-data-access';
import { CALEVENT_I18N_KEYS, CaleventI18n, isAttendanceClosed, splitAttendees, withoutCourseFields } from '@okr/calendar-calevent-util';

import { MandateStore, GrantorAttendanceService } from '@okr/relationship-mandate-feature';
import { MANDATE_I18N_KEYS } from '@okr/relationship-mandate-util';

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
    ImgDirective, NgTemplateOutlet,
    AvatarPipe, FullNamePipe, SvgIconPipe,
    EmptyList, CountPill,
    IonAccordion, IonItem, IonLabel, IonList, IonAvatar, IonIcon, IonButton, IonNote
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .header-icon {
      font-size: 20px;
      /* inherit the header item's text colour, i.e. the contrast of its [color] (white on primary) */
      color: inherit;
      margin-inline-end: 10px;
    }
    /* Ionic sets .accordion-expanded on the host while the accordion is open. The header sits on a
       coloured item, so only the weight changes — icon, label and pill keep their contrast colours. */
    ion-accordion.accordion-expanded ion-label { font-weight: 600; }
    /* the line between the confirmed attendees and the waiting list */
    .waitlist-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px 6px;
      color: var(--ion-color-warning-shade);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .waitlist-divider::before,
    .waitlist-divider::after {
      content: '';
      flex: 1;
      border-top: 2px solid var(--ion-color-warning);
    }
    .waiting-count { color: var(--ion-color-warning-shade); }
    .acted-for { display: block; font-size: 0.8em; }
    .answer-icon { font-size: 26px; cursor: pointer; margin-inline-start: 12px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="attendees">
    <ion-item slot="header" [color]="color()">
      <ion-icon class="header-icon" src="{{ 'people' | svgIcon }}" />
      <ion-label>{{ i18n.attendance_attendees() }}</ion-label>
      <okr-count-pill slot="end" [count]="attendees().length" />
      @if(canEdit()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(attendees().length === 0) {
        <okr-empty-list [message]="i18n.attendance_empty()" />
        @if(showAnswerIcons()) {
          <ion-list lines="none">
            <ion-item lines="none">
              <ng-container *ngTemplateOutlet="answerIcons" />
            </ion-item>
          </ion-list>
        }
        <ng-container *ngTemplateOutlet="grantorRows" />
      } @else {
        <ion-list lines="inset">
          <!-- confirmed, then the waiting list below the divider, then everyone who occupies no
               slot (declined / not yet answered). The order comes from splitAttendees. -->
          @for(attendee of split().confirmed; track $index) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: attendee }" />
          }
          @if(split().waiting.length > 0) {
            <div class="waitlist-divider"><span>{{ i18n.attendance_waitlist() }}</span></div>
            @for(attendee of split().waiting; track $index) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: attendee }" />
            }
          }
          @for(attendee of split().others; track $index) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: attendee }" />
          }
        </ion-list>
        <ion-list lines="none">
          <ion-item lines="none">
            <ion-label>
              {{ countLabel() }}
              @if(split().waiting.length > 0) { <span class="waiting-count"> · {{ waitingLabel() }}</span> }
            </ion-label>
            @if(showAnswerIcons()) {
              <ng-container *ngTemplateOutlet="answerIcons" />
            }
          </ion-item>
        </ion-list>
        <ng-container *ngTemplateOutlet="grantorRows" />
      }
    </div>
  </ion-accordion>

  <!-- «Für {name} anmelden / abmelden» under a Vollmacht (spec 1.180 §5.2): one row per grantor, the same icons -->
  <ng-template #grantorRows>
    @if(grantorOptions().length > 0) {
      <ion-list lines="none">
        @for(option of grantorOptions(); track option.key) {
          <ion-item lines="none">
            <ion-label>{{ option.name }}</ion-label>
            @if(option.state !== 'declined') {
              <ion-icon slot="end" class="answer-icon" color="danger" src="{{'cancel' | svgIcon }}"
                [attr.aria-label]="unattendLabel(option.name)" [title]="unattendLabel(option.name)" (click)="answerFor(option.key, 'declined')" />
            }
            @if(option.state !== 'accepted') {
              <ion-icon slot="end" class="answer-icon" color="success" src="{{'checkbox-circle' | svgIcon }}"
                [attr.aria-label]="attendLabel(option.name)" [title]="attendLabel(option.name)" (click)="answerFor(option.key, 'accepted')" />
            }
          </ion-item>
        }
      </ion-list>
    }
  </ng-template>

  <!-- the current user's first answer; once given, their row's ActionSheet changes it -->
  <ng-template #answerIcons>
    <ion-icon slot="end" class="answer-icon" color="danger" src="{{'cancel' | svgIcon }}"
      [attr.aria-label]="i18n.invitation_unsubscribe()" [title]="i18n.invitation_unsubscribe()" (click)="answer('declined')" />
    <ion-icon slot="end" class="answer-icon" color="success" src="{{'checkbox-circle' | svgIcon }}"
      [attr.aria-label]="i18n.invitation_subscribe()" [title]="i18n.invitation_subscribe()" (click)="answer('accepted')" />
  </ng-template>

  <!-- one row definition for all three blocks -->
  <ng-template #row let-attendee>
    <ion-item (click)="showActions(attendee)">
      <ion-icon slot="start" src="{{getAttendanceIcon(attendee.state) | svgIcon }}" color="{{getAttendanceColor(attendee.state)}}" />
      <ion-avatar slot="start">
        <img okrImg src="{{ 'person.' + attendee.person.key | avatar:'person' }}" alt="attendee avatar" />
      </ion-avatar>
      <ion-label>
        {{ attendee.person.name1 | fullName: attendee.person.name2 }}
        @if(actedForNote(attendee); as note) { <ion-note class="acted-for">{{ note }}</ion-note> }
      </ion-label>
      @if(canEdit()) {
        <ion-icon slot="end" src="{{'cancel' | svgIcon }}" (click)="remove(attendee, $event)" />
      }
    </ion-item>
  </ng-template>
  `,
})
export class AttendeesAccordion {
  private actionSheetController = inject(ActionSheetController);
  private modalController = inject(ModalController);
  private toastController = inject(ToastController);
  private firestoreService = inject(FirestoreService);
  private invitationService = inject(InvitationService);
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;
  private mandateStore = inject(MandateStore);
  private grantorAttendance = inject(GrantorAttendanceService);
  private readonly mandateI18n = inject(I18nService).translateAll(MANDATE_I18N_KEYS);
  private env = inject(ENV);
  private imgixBaseUrl = this.env.services.imgixBaseUrl;

  // inputs
  public calevent = input.required<CalEventModel>();
  public currentUser = input<UserModel | undefined>();
  public tenantId = input<string>('');
  public readonly color = input('primary');
  public readonly readOnly = input<boolean>(true);
  /**
   * The current user may answer this event (`canAttendCalevent`, decided by the caller: the reach
   * rule needs the calendars and invitations the store holds). Only then are the answer icons offered.
   */
  public readonly canAnswer = input<boolean>(false);
  /**
   * Offer «Für {name} anmelden / abmelden» per grantor (spec 1.180 §5.2). Set by the view modal only: the organiser's
   * edit modal works on a copy of the event. Independent of `canAnswer`, which is about the current user —
   * `GrantorAttendanceService.options` evaluates the grantor's own rights.
   */
  public readonly offerGrantorRows = input<boolean>(false);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** Neither read-only nor frozen by the event's own lock. */
  protected canEdit = computed(() => !this.isReadOnly() && !this.calevent().isLocked);

  // derived field
  // linkedSignal, not computed: add()/changeState() must publish a NEW array through a signal.
  // Mutating calevent().attendees in place changed the rendered length between the change-detection
  // and the verification pass -> NG0100 (ExpressionChangedAfterItHasBeenChecked).
  protected attendees = linkedSignal(() => this.calevent().attendees || []);
  protected acceptedCount = computed(() =>
    this.attendees().filter(inv => inv.state === 'accepted').length
  );
  /**
   * Confirmed / waiting / the rest. The waiting list is not stored: it is whatever exceeds
   * `maxAttendees` in sign-up order — so an unsubscription promotes the next person by itself.
   */
  protected split = computed(() => splitAttendees(this.attendees(), this.calevent().maxAttendees));
  /** '3 von max 12 Plätzen vergeben' on a capped event, '3 Teilnehmende' on an uncapped one. */
  protected countLabel = computed(() => {
    const max = this.calevent().maxAttendees ?? 0;
    if (max <= 0) return fill(this.i18n.attendance_accepted_count(), { count: this.acceptedCount() });
    return fill(this.i18n.attendance_confirmed_count(), { confirmed: this.split().confirmed.length, max });
  });
  /** The current user's entry; undefined until they answered (or were invited). */
  private myAttendee = computed(() => {
    const personKey = this.currentUser()?.personKey;
    return personKey ? this.attendees().find(a => a.person.key === personKey) : undefined;
  });
  /** Unanswered = no entry yet, or an invitation still open. */
  protected showAnswerIcons = computed(() =>
    coerceBoolean(this.canAnswer()) && !isAttendanceClosed(this.calevent()) &&
    (this.myAttendee()?.state ?? 'invited') === 'invited'
  );
  /**
   * The grantors I may sign up or off for here (spec 1.180 §5.2), where `offerGrantorRows` is set. `options` applies to
   * the grantor every check that runs for my own sign-up. It reads the event with the accordion's own attendee list,
   * so the rows follow a change that was written to Firestore only.
   */
  protected grantorOptions = computed(() => {
    const calevent = this.calevent();
    if (!coerceBoolean(this.offerGrantorRows()) || isAttendanceClosed(calevent)) return [];
    return this.grantorAttendance.options({ ...calevent, attendees: this.attendees() });
  });
  protected waitingLabel = computed(() =>
    fill(this.i18n.attendance_waiting_count(), { count: this.split().waiting.length })
  );

  /******************************* actions *************************************** */
  /**
   * Displays an ActionSheet with all possible actions on an Invitation. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param attendee 
   */
  protected async showActions(attendee: Attendee): Promise<void> {
    // attendance can no longer be changed for past, locked or cancelled events
    if (isAttendanceClosed(this.calevent())) return;
    // read-only (view modal, edit modal of a non-organiser): only the user's own row stays answerable
    if (this.isReadOnly() && !this.isMe(attendee)) return;
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
    const isMe = this.isMe(attendee);
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
          await this.changeAnyState(attendee, 'accepted');
          break;
        case 'calevent.unsubscribe':
          await this.changeAnyState(attendee, 'declined');
          break;
      }
    }
  }

  /** The answer icons: the user answers for themselves, with a new entry when they have none yet. */
  protected async answer(newState: 'accepted' | 'declined'): Promise<void> {
    if (!this.showAnswerIcons()) return;
    const existing = this.myAttendee();
    if (existing) {
      await this.changeOwnState(existing, newState);
      return;
    }
    const user = this.currentUser();
    const avatar = user ? getAvatarInfoForCurrentUser(user) : undefined;
    if (!avatar) return;
    await this.changeOwnState({ person: avatar, state: 'invited' }, newState);
  }

  /** Signs a grantor up or off in my name; the service re-reads the Vollmacht, checks and tells the grantor. */
  protected async answerFor(grantorKey: string, newState: 'accepted' | 'declined'): Promise<void> {
    const calevent = this.calevent();
    if (!await this.grantorAttendance.changeAttendanceFor(calevent, grantorKey, newState)) return;
    // an answered invitation is written to Firestore only: re-read the list so the row shows the new state.
    // Only the accordion's own signal changes; the event object belongs to the caller.
    const fresh = calevent.okey ? await this.firestoreService.readModelOnce<CalEventModel>('calevents', calevent.okey) : undefined;
    if (fresh?.attendees) this.attendees.set(fresh.attendees);
  }

  protected attendLabel(name: string): string {
    return fill(this.mandateI18n.attend_for(), { name });
  }

  protected unattendLabel(name: string): string {
    return fill(this.mandateI18n.unattend_for(), { name });
  }

  /** «von Beat für Anna» when somebody else answered for this attendee under a Vollmacht; '' otherwise. */
  protected actedForNote(attendee: Attendee): string {
    const actedByKey = attendee.actedByKey;
    if (!actedByKey || actedByKey === attendee.person.key) return '';
    const actor = this.mandateStore.nameOf(actedByKey);
    const subject = attendee.person.name1 || this.mandateStore.nameOf(attendee.person.key);
    return actor && subject ? fill(this.mandateI18n.acted_for(), { actor, subject }) : '';
  }

  /******************************* helpers *************************************** */
  protected isOngoing(membership: MembershipModel): boolean {
    return isOngoing(membership.dateOfExit);
  }

  protected async add(): Promise<void> {
   if (!this.canEdit()) return;
   const modal = await this.modalController.create({
      component: PersonSelectModal,
      cssClass: ['modal-narrow', 'modal-fixed-height'],
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

  /**
   * Someone moving INTO 'accepted' is appended rather than edited in place: the waiting list is
   * derived from array order, so keeping their old position would let a person who declined and
   * changed their mind reclaim an early slot and push a confirmed attendee onto the waiting list.
   * Same rule as CalEventStore.changeAttendanceState.
   */
  private async changeState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    await this.saveAttendees(this.withState(attendee, newState));
  }

  private withState(attendee: Attendee, newState: 'accepted' | 'declined'): Attendee[] {
    if ((newState === 'accepted' && attendee.state !== 'accepted') || !this.attendees().includes(attendee)) {
      return [...this.attendees().filter(a => a !== attendee), { ...attendee, state: newState }];
    }
    return this.attendees().map(a => a === attendee ? { ...a, state: newState } : a);
  }

  private async changeAnyState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    if (this.isMe(attendee)) {
      await this.changeOwnState(attendee, newState);
    } else {
      await this.changeState(attendee, newState);
    }
  }

  /**
   * The current user answers for themselves — allowed even when the accordion is read-only.
   * Same routing as CalEventStore.changeOwnAttendance: an invitation, if the user holds one, is
   * answered through InvitationService.respond (answer trail + the attendee entry, in a transaction);
   * otherwise the attendee list is written directly.
   */
  private async changeOwnState(attendee: Attendee, newState: 'accepted' | 'declined'): Promise<void> {
    const invitation = await this.findOwnInvitation();
    if (!invitation) {
      await this.changeState(attendee, newState);
      return;
    }
    if (invitation.isLocked) {
      error(this.toastController, this.i18n.invitation_locked_hint());
      return;
    }
    // show the answer at once; the service writes it to Firestore
    const attendees = this.withState(attendee, newState);
    this.calevent().attendees = attendees;
    this.attendees.set(attendees);
    await this.invitationService.respond(invitation, newState, this.currentUser());
  }

  /** The current user's invitation to this occurrence, if any (same cached query as CalEventStore). */
  private async findOwnInvitation(): Promise<InvitationModel | undefined> {
    const personKey = this.currentUser()?.personKey;
    const caleventKey = this.calevent().okey;
    if (!personKey || !caleventKey) return undefined;
    const invitations = await firstValueFrom(
      this.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(this.env.tenantId), 'inviteeKey', 'asc')
    );
    return invitations.find(inv => inv.inviteeKey === personKey && inv.caleventKey === caleventKey);
  }

  private isMe(attendee: Attendee): boolean {
    const personKey = this.currentUser()?.personKey;
    return !!personKey && attendee.person.key === personKey;
  }

  /** Removes the attendee from the calevent (organiser/admin only). */
  protected async remove(attendee: Attendee, event: Event): Promise<void> {
    event.stopPropagation();   // do not open the attendance ActionSheet of the row
    if (this.isReadOnly() || this.calevent().isLocked) return;
    await this.saveAttendees(this.attendees().filter(a => a !== attendee));
  }

  /** Publishes the new attendee list to the template, the shared calevent object (the parent form saves it) and Firestore. */
  private async saveAttendees(attendees: Attendee[]): Promise<void> {
    const calevent = this.calevent();
    calevent.attendees = attendees;
    this.attendees.set(attendees);
    await this.firestoreService.updateModel<CalEventModel>('calevents', withoutCourseFields(calevent), false, this.i18n.update_conf(), this.i18n.update_error(), this.currentUser());
  }

  protected getAttendanceIcon(state: string): string {
    return getAttendanceIcon(state);
  }

  protected getAttendanceColor(state: string): string {
    return getAttendanceColor(state);
  }
}
