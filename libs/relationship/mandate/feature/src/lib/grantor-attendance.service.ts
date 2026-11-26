import { computed, inject, Injectable, Injector, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ToastController } from '@ionic/angular';
import { combineLatest, map, of } from 'rxjs';

import { applyAttendanceFor, CALEVENT_I18N_KEYS, formatDateTimeLabel, grantorAttendOptions, GrantorContext, isAttendanceClosed, mayJoinOpenCalevent } from '@okr/calendar-calevent-util';
import { InvitationService } from '@okr/relationship-invitation-data-access';
import { MandateService, notifyGrantor } from '@okr/relationship-mandate-data-access';
import { MANDATE_I18N_KEYS } from '@okr/relationship-mandate-util';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CalendarCollection, CalendarModel, CalEventCollection, CalEventModel, CalEventModelName, InvitationCollection, InvitationModel, MandateModel } from '@okr/shared-models';
import { lazyService, notify, resourceParams, showToast } from '@okr/shared-util-angular';
import { fill, getAvatarInfoForCurrentUser, getSystemQuery, newAvatarInfo, warn } from '@okr/shared-util-core';

import { MandateStore } from './mandate.store';

const NO_ORGS: { key: string; orgKeys: string[] }[] = [];
const NO_INVITATIONS: InvitationModel[] = [];
const NO_CALENDARS: CalendarModel[] = [];

/**
 * Signing a grantor up for an event, or off it, under a family Vollmacht (spec 1.180 §5.2). There is one place for it,
 * so the calendar list (`CalEventStore`) and the calendar section (`CalendarStore`) behave the same way.
 *
 * - **What the checks need per grantor** (`contexts`): first name, the calendars of the orgs they belong to (their
 *   group reach) and their invitations. All of it is loaded only for grantors whose `calevent.attend` Vollmacht is
 *   active today. The calendar and invitation reads reuse the stores' cached tenant queries.
 * - **Which rows the ActionSheet offers** (`options`): every check that runs for the user's own sign-up runs for the
 *   grantor.
 * - **The write** (`changeAttendanceFor`): it re-reads the Vollmacht from the server, honours the event's lock and
 *   closed state, answers the grantor's invitation if there is one (otherwise it writes `attendees` only), stamps
 *   `actedByKey`, and tells the grantor with a task (§5.3).
 */
@Injectable({ providedIn: 'root' })
export class GrantorAttendanceService {
  private readonly appStore = inject(AppStore);
  private readonly mandateStore = inject(MandateStore);
  private readonly mandateService = inject(MandateService);
  private readonly membershipService = inject(MembershipService);
  private readonly invitationService = inject(InvitationService);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS);
  private readonly mandateI18n = inject(I18nService).translateAll(MANDATE_I18N_KEYS);
  // Lazy: the notice is the only use, and only after a delegated change.
  private readonly taskService = lazyService(inject(Injector), () =>
    import('@okr/project-task-data-access').then(m => m.TaskService));

  /** grantors who gave me `calevent.attend` and whose Vollmacht is active today */
  private readonly grantorKeys: Signal<string[]> = this.mandateStore.grantorKeysFor('calevent.attend');
  private readonly params = resourceParams(() => ({ grantorKeys: this.grantorKeys(), tenantId: this.appStore.tenantId() }));

  private readonly membershipsResource = rxResource({
    params: this.params,
    stream: ({ params }) => params.grantorKeys.length === 0 ? of(NO_ORGS) : combineLatest(params.grantorKeys.map(key =>
      this.membershipService.listOrgsOfMember(key, 'person').pipe(map(orgKeys => ({ key, orgKeys }))))),
  });

  /** the same cached tenant stream as the stores' own invitations, filtered by `inviteeKey` */
  private readonly invitationsResource = rxResource({
    params: this.params,
    stream: ({ params }) => params.grantorKeys.length === 0 ? of(NO_INVITATIONS)
      : this.appStore.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(params.tenantId), 'inviteeKey', 'asc').pipe(
        map(invitations => invitations.filter(inv => params.grantorKeys.includes(inv.inviteeKey)))),
  });

  /** the same cached tenant stream as the stores' `calendarsResource` */
  private readonly calendarsResource = rxResource({
    params: this.params,
    stream: ({ params }) => params.grantorKeys.length === 0 ? of(NO_CALENDARS)
      : this.appStore.firestoreService.searchData<CalendarModel>(CalendarCollection, getSystemQuery(params.tenantId), 'name', 'asc'),
  });

  private readonly groupCalendarKeys = computed(() => (this.calendarsResource.value() ?? NO_CALENDARS)
    .filter(cal => cal.owner?.startsWith('group.') === true)
    .map(cal => cal.okey));

  /** per active `calevent.attend` grantor: first name, the calendars of their orgs, their invitations */
  public readonly contexts: Signal<GrantorContext[]> = computed(() => {
    const calendars = this.calendarsResource.value() ?? NO_CALENDARS;
    const memberships = this.membershipsResource.value() ?? NO_ORGS;
    const invitations = this.invitationsResource.value() ?? NO_INVITATIONS;
    const mandates = this.mandateStore.activeAsGrantee();
    return this.grantorKeys().map(key => {
      const orgKeys = memberships.find(m => m.key === key)?.orgKeys ?? [];
      return {
        key,
        name: mandates.find(m => m.grantorKey === key)?.grantor?.name1 || this.appStore.getPerson(key)?.firstName || '',
        calendarKeys: calendars.filter(cal => orgKeys.includes(cal.owner)).map(cal => cal.okey),
        invitations: invitations.filter(inv => inv.inviteeKey === key),
      };
    });
  });

  /** The grantors I may sign up or off for on this event, each with their current state. */
  public options(calEvent: CalEventModel): { key: string; name: string; state: string }[] {
    const contexts = this.contexts();
    if (contexts.length === 0) return [];
    const groupCalendarKeys = this.groupCalendarKeys();
    return grantorAttendOptions(calEvent, contexts.map(ctx => ({
      key: ctx.key,
      name: ctx.name,
      hasInvitation: ctx.invitations.some(inv => inv.caleventKey === calEvent.okey),
      mayJoinOpen: mayJoinOpenCalevent(calEvent.calendars, groupCalendarKeys, ctx.calendarKeys),
    })));
  }

  /**
   * Signs `grantorKey` up for `calEvent`, or off it, in my name.
   *
   * The Vollmacht is re-read from the server first. A Vollmacht revoked elsewhere since the list loaded is refused
   * with a toast, and so is a check that cannot reach the server. The re-read Vollmacht must be a family Vollmacht of
   * exactly this grantor, given to me, that includes `calevent.attend`. The person written onto the event is built
   * from `grantorKey`, never from the avatar stored on the Vollmacht.
   */
  public async changeAttendanceFor(calEvent: CalEventModel, grantorKey: string, newState: 'accepted' | 'declined'): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const actor = currentUser ? getAvatarInfoForCurrentUser(currentUser) : undefined;
    if (!currentUser || !actor?.key || !grantorKey) return;
    if (calEvent.isLocked) {
      await notify(this.alertController, this.i18n.locked_title(), this.i18n.locked_hint(), this.i18n.ok());
      return;
    }
    if (isAttendanceClosed(calEvent)) return;
    const context = this.contexts().find(ctx => ctx.key === grantorKey);
    const held = this.mandateStore.activeAsGrantee()
      .find(m => m.kind === 'family' && m.grantorKey === grantorKey && m.actions.includes('calevent.attend'));
    if (!context || !held) return;

    let mandate: MandateModel | undefined;
    try {
      mandate = await this.mandateService.readActive(held.okey, this.appStore.tenantId());
    } catch (ex) {
      warn(`GrantorAttendanceService.changeAttendanceFor: ${(ex as Error).message}`);
      await showToast(this.toastController, this.mandateI18n.mandate_check_error());
      return;
    }
    if (!mandate || mandate.kind !== 'family' || mandate.grantorKey !== grantorKey
        || mandate.granteeKey !== actor.key || !mandate.actions.includes('calevent.attend')) {
      await showToast(this.toastController, fill(this.mandateI18n.mandate_inactive(), { name: context.name }));
      this.mandateStore.reload();
      return;
    }
    const subject = newAvatarInfo(grantorKey, context.name, this.appStore.getPerson(grantorKey)?.lastName ?? '', 'person', '', '', '');

    // the waiting-list hint is read from the event as loaded, before the write — as for my own sign-up
    const { attendees, waitlisted } = applyAttendanceFor(calEvent.attendees, subject, newState, actor.key, calEvent.maxAttendees);
    const invitation = context.invitations.find(inv => inv.caleventKey === calEvent.okey);
    if (invitation) {
      if (invitation.isLocked) {
        await notify(this.alertController, this.i18n.invitation_locked_title(), this.i18n.invitation_locked_hint(), this.i18n.ok());
        return;
      }
      if (!await this.invitationService.respond(invitation, newState, currentUser, undefined, actor.key)) return;
    } else {
      const key = await this.appStore.firestoreService.updateFields(CalEventCollection, calEvent.okey, { attendees }, this.i18n.update_error());
      if (!key) return;
      calEvent.attendees = attendees;
      await showToast(this.toastController, this.i18n.update_conf());
    }
    if (waitlisted) await showToast(this.toastController, this.i18n.attendance_waitlist_hint());

    const text = fill(newState === 'accepted' ? this.mandateI18n.notice_attend() : this.mandateI18n.notice_unattend(), {
      actor: actor.name1,
      event: `${calEvent.name}, ${formatDateTimeLabel(calEvent.startDate, calEvent.startTime)}`,
    });
    try {
      await notifyGrantor(await this.taskService(), mandate, actor, subject, text, { modelType: CalEventModelName, key: calEvent.okey });
    } catch (ex) {
      warn(`GrantorAttendanceService.changeAttendanceFor(notice): ${(ex as Error).message}`);
    }
  }
}
