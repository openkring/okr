import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { catchError, combineLatest, firstValueFrom, map, of } from 'rxjs';

import { HouseholdService } from '@okr/relationship-household-data-access';
import { MandateService } from '@okr/relationship-mandate-data-access';
import { PersonalRelService } from '@okr/relationship-personal-rel-data-access';
import { grantorKeysFor, isMandateActive, mandatePartyName, MANDATE_I18N_KEYS, MandateI18n, mayReceiveProxy, mayRecordProxy, proxyFor, proxyReplaces, proxyRevokeAction } from '@okr/relationship-mandate-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, MandateAction, MandateModel, MeetingCollection, MeetingModel } from '@okr/shared-models';
import { confirm, resourceParams, showToast } from '@okr/shared-util-angular';
import { DateFormat, fill, getAvatarInfoForCurrentUser, getFullName, getTodayStr, hasRole, newAvatarInfo } from '@okr/shared-util-core';

const NO_MANDATES: MandateModel[] = [];
const NO_MEETINGS: MeetingModel[] = [];

/**
 * Vollmachten of the current user (spec 1.180 §5): the ones I gave (`given`) and the ones I received (`received`),
 * in all states — callers decide with `isMandateActive`. Both are live queries keyed on the current user's personKey
 * and the app tenant, so a create or a revocation shows up without a reload.
 *
 * Provided in root: the profile accordion and later the calevent / invitation views load it with `await import()`
 * and `injector.get(MandateStore)`. The store opens its modal with `await import()` as well (store↔modal cycle).
 */
export const MandateStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    mandateService: inject(MandateService),
    householdService: inject(HouseholdService),
    personalRelService: inject(PersonalRelService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    i18n: inject(I18nService).translateAll(MANDATE_I18N_KEYS) as MandateI18n,
  })),
  withProps((store) => {
    const params = resourceParams(() => ({
      tenantId: store.appStore.tenantId(),
      personKey: store.appStore.currentUser()?.personKey ?? '',
    }));
    return {
      givenResource: rxResource({
        params,
        stream: ({ params: p }) => p.personKey ? store.mandateService.listAsGrantor(p.tenantId, p.personKey) : of(NO_MANDATES),
      }),
      receivedResource: rxResource({
        params,
        stream: ({ params: p }) => p.personKey ? store.mandateService.listAsGrantee(p.tenantId, p.personKey) : of(NO_MANDATES),
      }),
    };
  }),
  withComputed((store) => ({
    given: computed(() => store.givenResource.value() ?? NO_MANDATES),
    received: computed(() => store.receivedResource.value() ?? NO_MANDATES),
    personKey: computed(() => store.appStore.currentUser()?.personKey ?? ''),
  })),
  withProps((store) => {
    // the meetings of my proxies (given or received), for their name and whether they are still open
    const params = resourceParams(() => ({
      keys: [...new Set([...store.given(), ...store.received()].filter((m) => m.kind === 'proxy' && !!m.meetingKey).map((m) => m.meetingKey))].sort(),
    }));
    return {
      proxyMeetingsResource: rxResource({
        params,
        stream: ({ params: p }) => p.keys.length === 0 ? of(NO_MEETINGS) : combineLatest(p.keys.map((key) =>
          store.appStore.firestoreService.readModel<MeetingModel>(MeetingCollection, key).pipe(
            // a meeting I cannot read (or that is gone) just stays unknown: its proxies are shown read-only
            catchError(() => of(undefined)),
          ))).pipe(map((meetings) => meetings.filter((m): m is MeetingModel => !!m))),
      }),
    };
  }),
  withComputed((store) => ({
    /** the Vollmachten I may act on today */
    activeAsGrantee: computed(() => {
      const today = getTodayStr(DateFormat.StoreDate);
      return store.received().filter((m) => isMandateActive(m, today));
    }),
    /** the meetings my proxies are for, as far as they could be read */
    proxyMeetings: computed(() => store.proxyMeetingsResource.value() ?? NO_MEETINGS),
  })),
  withMethods((store) => ({
    /**
     * Sets `revokedAt` / `revokedByKey` = me. The live lists pick the change up; a failed or thrown write shows a toast.
     * @returns true when the revocation was written
     */
    async revokeAsMe(mandate: MandateModel): Promise<boolean> {
      const personKey = store.personKey();
      if (!personKey || !mandate.okey) return false;
      let ok = false;
      try {
        ok = await store.mandateService.revoke(mandate, personKey);
      } catch (error) {
        console.error('MandateStore.revoke:', error);
      }
      if (!ok) await showToast(store.toastController, MANDATE_I18N_KEYS.revoke_error);
      return ok;
    },
  })),
  withMethods((store) => ({
    /**
     * The persons offered first in the modal (spec §5.1, a convenience — they receive nothing automatically): the
     * other members of my household and my current personal relationships (I am subject or object), deduplicated.
     * Best effort: a failed or denied read just means fewer suggestions.
     */
    async suggestionsFor(personKey: string): Promise<AvatarInfo[]> {
      const tenantId = store.appStore.tenantId();
      const today = getTodayStr(DateFormat.StoreDate);
      const byKey = new Map<string, AvatarInfo>();
      const add = (key: string, firstName: string, lastName: string): void => {
        if (!key || key === personKey || byKey.has(key)) return;
        byKey.set(key, newAvatarInfo(key, firstName, lastName, 'person', '', '', ''));
      };
      try {
        const households = await firstValueFrom(store.householdService.listForPerson(tenantId, personKey));
        for (const key of households.flatMap((h) => h.memberKeys ?? [])) {
          const p = store.appStore.getPerson(key);
          if (p) add(key, p.firstName, p.lastName);
        }
      } catch (error) {
        console.error('MandateStore.suggestionsFor(household):', error);
      }
      try {
        const rels = await firstValueFrom(store.personalRelService.listPersonalRelsOfPerson(personKey));
        for (const r of rels) {
          if (r.isArchived || ((r.validTo ?? '') !== '' && r.validTo < today)) continue;
          if (r.subjectKey === personKey) add(r.objectKey, r.objectFirstName, r.objectLastName);
          else add(r.subjectKey, r.subjectFirstName, r.subjectLastName);
        }
      } catch (error) {
        console.error('MandateStore.suggestionsFor(personalRel):', error);
      }
      return [...byKey.values()];
    },
  })),
  withMethods((store) => ({
    /** the persons on whose behalf I may do `action` today */
    grantorKeysFor(action: MandateAction): Signal<string[]> {
      return computed(() => grantorKeysFor(store.received(), store.personKey(), action, getTodayStr(DateFormat.StoreDate)));
    },

    /**
     * First name of the person behind a Vollmacht, for «von X für Y» (spec 1.180 §4.3): the loaded person, else the
     * name on a Vollmacht I gave or received. '' when neither knows them — never the key.
     */
    nameOf(personKey: string): string {
      return store.appStore.getPerson(personKey)?.firstName || mandatePartyName(personKey, store.given(), store.received());
    },

    reload(): void {
      store.givenResource.reload();
      store.receivedResource.reload();
    },

    /** Opens the modal for a new family Vollmacht given by me; the modal saves it. */
    async createFamily(): Promise<void> {
      const currentUser = store.appStore.currentUser();
      const grantor = currentUser ? getAvatarInfoForCurrentUser(currentUser) : undefined;
      if (!currentUser || !grantor?.key) return;
      const mandate = new MandateModel(store.appStore.tenantId());
      mandate.kind = 'family';
      mandate.grantorKey = grantor.key;
      mandate.grantor = grantor;
      mandate.actions = ['calevent.attend', 'invitation.answer'];
      mandate.createdByKey = grantor.key;
      const [{ MandateEditModal }, suggestions] = await Promise.all([import('./mandate-edit.modal'), store.suggestionsFor(grantor.key)]);
      const modal = await store.modalController.create({
        component: MandateEditModal,
        componentProps: { mandate, existing: store.given(), suggestions },
      });
      await modal.present();
      await modal.onWillDismiss();
    },

    /**
     * The proxies recorded for a meeting (spec 1.180 §6), in all states — callers show the active ones. A failed read
     * means no proxies are shown.
     */
    async proxiesForMeeting(meetingKey: string): Promise<MandateModel[]> {
      if (!meetingKey) return NO_MANDATES;
      try {
        return await firstValueFrom(store.mandateService.listProxiesForMeeting(store.appStore.tenantId(), meetingKey));
      } catch (error) {
        console.error('MandateStore.proxiesForMeeting:', error);
        return NO_MANDATES;
      }
    },
  })),
  withMethods((store) => ({
    /**
     * Opens the modal that records a proxy of `grantorKey` for `meeting` (spec 1.180 §6); the modal saves it. Refused
     * silently unless the caller may record it (`mayRecordProxy`: open meeting, cap > 0, grantor / chair / admin) and
     * the grantor is an attendee. The grantee is offered among the other attendees who may still receive a proxy; the
     * grantor's current proxy, which the new one replaces, does not count against its holder.
     * @returns true when a proxy was recorded
     */
    async recordProxy(meeting: MeetingModel, grantorKey: string): Promise<boolean> {
      const currentUser = store.appStore.currentUser();
      const callerKey = currentUser?.personKey ?? '';
      const cap = store.appStore.appConfig().maxProxiesPerHolder ?? 1;
      const isAdmin = hasRole('privileged', currentUser) || hasRole('memberAdmin', currentUser);
      if (!currentUser || !mayRecordProxy(meeting, grantorKey, callerKey, cap, isAdmin)) return false;
      const attendees = (meeting.attendees ?? []).map(a => a.person).filter(p => !!p?.key);
      const grantor = attendees.find(p => p.key === grantorKey);
      if (!grantor) return false;

      const today = getTodayStr(DateFormat.StoreDate);
      const proxies = await store.proxiesForMeeting(meeting.okey);
      const replaced = proxyReplaces(proxies, meeting.okey, grantorKey, today);
      const counted = proxies.filter(p => p.okey !== replaced?.okey);
      const suggestions = attendees.filter(p => p.key !== grantorKey && mayReceiveProxy(counted, meeting.okey, p.key, cap, today));

      const mandate = new MandateModel(store.appStore.tenantId());
      mandate.kind = 'proxy';
      mandate.grantorKey = grantor.key;
      mandate.grantor = grantor;
      mandate.actions = ['meeting.represent'];
      mandate.meetingKey = meeting.okey;
      mandate.createdByKey = callerKey;
      const { MandateEditModal } = await import('./mandate-edit.modal');
      const modal = await store.modalController.create({
        component: MandateEditModal,
        componentProps: { mandate, suggestions, meeting, proxyCap: cap },
      });
      await modal.present();
      const { role } = await modal.onWillDismiss();
      return role === 'confirm';
    },

    /**
     * Revokes the active proxy of `grantorKey` for `meeting`, or gives it back when I hold it (spec 1.180 §5.1, §6),
     * after a confirm. Refused silently unless `proxyRevokeAction` allows it (open meeting; holder, grantor, chair or
     * admin) — the rules check the same. The proxies are read afresh, so a proxy changed elsewhere is not touched.
     * @returns true when the proxy was ended
     */
    async revokeProxy(meeting: MeetingModel, grantorKey: string): Promise<boolean> {
      const currentUser = store.appStore.currentUser();
      const callerKey = currentUser?.personKey ?? '';
      const isAdmin = hasRole('privileged', currentUser) || hasRole('memberAdmin', currentUser);
      const today = getTodayStr(DateFormat.StoreDate);
      const proxy = proxyFor(await store.proxiesForMeeting(meeting.okey), meeting.okey, grantorKey, today);
      if (!proxy) return false;
      const action = proxyRevokeAction(meeting, proxy, callerKey, isAdmin, today);
      if (action === '') return false;
      const i18n = store.i18n;
      const names = {
        grantor: getFullName(proxy.grantor?.name1 ?? '', proxy.grantor?.name2 ?? '') || i18n.person_unknown(),
        holder: getFullName(proxy.grantee?.name1 ?? '', proxy.grantee?.name2 ?? '') || i18n.person_unknown(),
        meeting: meeting.name || i18n.meeting_unknown(),
      };
      const [message, label] = action === 'give_back'
        ? [fill(i18n.proxy_give_back_confirm(), names), i18n.give_back()]
        : [fill(i18n.proxy_revoke_confirm(), names), i18n.revoke()];
      if (!await confirm(store.alertController, message, label, i18n.cancel(), true)) return false;
      return store.revokeAsMe(proxy);
    },

    /** The grantor revokes a Vollmacht (one-way; the rules require my own personKey as `revokedByKey`). */
    async revoke(mandate: MandateModel): Promise<boolean> {
      return store.revokeAsMe(mandate);
    },

    /** The grantee gives a Vollmacht back — the same revocation, stamped with the grantee's own key. */
    async giveBack(mandate: MandateModel): Promise<boolean> {
      return store.revokeAsMe(mandate);
    },
  })),
);
