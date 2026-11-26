import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { HouseholdService } from '@okr/relationship-household-data-access';
import { MandateService } from '@okr/relationship-mandate-data-access';
import { PersonalRelService } from '@okr/relationship-personal-rel-data-access';
import { grantorKeysFor, isMandateActive, MANDATE_I18N_KEYS } from '@okr/relationship-mandate-util';
import { AppStore } from '@okr/shared-feature';
import { AvatarInfo, MandateAction, MandateModel } from '@okr/shared-models';
import { resourceParams, showToast } from '@okr/shared-util-angular';
import { DateFormat, getAvatarInfoForCurrentUser, getTodayStr, newAvatarInfo } from '@okr/shared-util-core';

const NO_MANDATES: MandateModel[] = [];

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
  withComputed((store) => ({
    /** the Vollmachten I may act on today */
    activeAsGrantee: computed(() => {
      const today = getTodayStr(DateFormat.StoreDate);
      return store.received().filter((m) => isMandateActive(m, today));
    }),
  })),
  withMethods((store) => ({
    /** Sets `revokedAt` / `revokedByKey` = me. The live lists pick the change up; a failed or thrown write shows a toast. */
    async revokeAsMe(mandate: MandateModel): Promise<void> {
      const personKey = store.personKey();
      if (!personKey || !mandate.okey) return;
      let ok = false;
      try {
        ok = await store.mandateService.revoke(mandate, personKey);
      } catch (error) {
        console.error('MandateStore.revoke:', error);
      }
      if (!ok) await showToast(store.toastController, MANDATE_I18N_KEYS.revoke_error);
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

    /** The grantor revokes a Vollmacht (one-way; the rules require my own personKey as `revokedByKey`). */
    async revoke(mandate: MandateModel): Promise<void> {
      await store.revokeAsMe(mandate);
    },

    /** The grantee gives a Vollmacht back — the same revocation, stamped with the grantee's own key. */
    async giveBack(mandate: MandateModel): Promise<void> {
      await store.revokeAsMe(mandate);
    },
  })),
);
