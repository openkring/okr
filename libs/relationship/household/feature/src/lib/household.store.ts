import { inject } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { HouseholdService } from '@okr/relationship-household-data-access';
import { HOUSEHOLD_I18N_KEYS, HouseholdEditMode, HouseholdI18n, householdErrorKey } from '@okr/relationship-household-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { HouseholdModel, HouseholdTypeCategoryName } from '@okr/shared-models';
import { showToast } from '@okr/shared-util-angular';

type HouseholdState = { isSaving: boolean };

/**
 * Haushalte (spec 1.168): opens the edit modal for a person's household and saves it through the `saveHousehold`
 * callable. Provided in root, so a caller outside this lib (person actions) can load it with `await import()`
 * and `injector.get(HouseholdStore)` without a static import cycle.
 */
export const HouseholdStore = signalStore(
  { providedIn: 'root' },
  withState<HouseholdState>({ isSaving: false }),
  withProps(() => ({
    householdService: inject(HouseholdService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    i18n: inject(I18nService).translateAll(HOUSEHOLD_I18N_KEYS) as HouseholdI18n,
  })),
  withMethods((store) => ({
    /**
     * The household of the person in this tenant, or `undefined`. An admin reads the tenant's households (the rules
     * prove the tenant from that query); a member reads their own by `memberKeys`.
     */
    async findForPerson(personKey: string, mode: HouseholdEditMode): Promise<HouseholdModel | undefined> {
      const tenantId = store.appStore.tenantId();
      const list$ = mode === 'admin'
        ? store.householdService.listForTenant(tenantId, personKey)
        : store.householdService.listForPerson(tenantId, personKey);
      return (await firstValueFrom(list$))[0];
    },

    /** A new household containing the person (admin only): they are payer and contact until somebody else is picked. */
    newHousehold(personKey: string): HouseholdModel {
      const tenantId = store.appStore.tenantId();
      const household = new HouseholdModel(tenantId);
      household.memberKeys = [personKey];
      household.payerKey = personKey;
      household.contactKey = personKey;
      household.name = store.appStore.getPerson(personKey)?.lastName ?? '';
      household.type = store.appStore.getCategory(HouseholdTypeCategoryName).items[0]?.name ?? '';
      return household;
    },

    /** Saves through the callable and tells the user how it went; a refusal shows its own message. */
    async save(household: HouseholdModel): Promise<string | undefined> {
      patchState(store, { isSaving: true });
      try {
        const okey = await store.householdService.save(store.appStore.tenantId(), household);
        await showToast(store.toastController, HOUSEHOLD_I18N_KEYS.save_conf);
        return okey;
      } catch (error) {
        console.error('HouseholdStore.save:', error);
        await showToast(store.toastController, HOUSEHOLD_I18N_KEYS[householdErrorKey(error)]);
        return undefined;
      } finally {
        patchState(store, { isSaving: false });
      }
    },
  })),
  withMethods((store) => ({
    /**
     * Opens the person's household in the edit modal — or, for an admin, a new one containing the person — and saves
     * it on confirm. A member without a household gets a hint instead.
     *
     * Returns the household as saved (the callable's okey plus the edited data), or `undefined` when nothing was
     * saved (cancelled, refused, no household). Callers show this instead of re-reading: a cached query stream can
     * still hold the household as it was before the edit.
     */
    async edit(personKey: string, mode: HouseholdEditMode): Promise<HouseholdModel | undefined> {
      if (!personKey) return undefined;
      const existing = await store.findForPerson(personKey, mode);
      if (!existing && mode !== 'admin') {
        await showToast(store.toastController, HOUSEHOLD_I18N_KEYS.no_household);
        return undefined;
      }
      const household = existing ?? store.newHousehold(personKey);
      const { HouseholdEditModal } = await import('./household-edit.modal');
      const modal = await store.modalController.create({
        component: HouseholdEditModal,
        componentProps: {
          household,
          mode,
          typeList: store.appStore.getCategory(HouseholdTypeCategoryName),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<HouseholdModel>();
      if (role !== 'confirm' || !data) return undefined;
      const okey = await store.save(data);
      return okey ? { ...data, okey } : undefined;
    },
  })),
);
