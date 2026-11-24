import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { hasRole, isOperator } from '@okr/shared-util-core';
import {
  SETTINGS_CONFIRM_I18N_KEYS, SETTINGS_GROUPS, confirmationMessage, settingsConfirmations, settingsDiff, settingsOf,
} from '@okr/tenant-util';
import type { SettingsGroupId, TenantSettings } from '@okr/tenant-util';

/**
 * Reads and writes the settings groups of `app-config` (spec 1.174 §7). Deliberately NOT exported from
 * `index.ts`: that barrel is in every app's start bundle, and this store is only needed by the deferred
 * settings page, which imports it by relative path.
 *
 * It decides nothing about validity: the form of the page does, and only calls `save` with valid values.
 */
export const TenantSettingsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    _appStore: inject(AppStore),
    _appConfigService: inject(AppConfigService),
    _activityService: inject(ActivityService),
    _alertService: inject(AlertService),
    _texts: inject(I18nService).translateAll(SETTINGS_CONFIRM_I18N_KEYS),
  })),
  withComputed((store) => ({
    /**
     * True only when the real `app-config` document of the own tenant is here. `appConfig()` never is nullish: before
     * the read finishes, after a failed read and for a missing document it holds class defaults, and a snapshot of
     * those is wrong (misleading values, wrong widening dialog). `isAppConfigSettled` alone is not enough, it is also
     * true after an error, hence the value check (same guard as `CustomizeTab`).
     * Task 3's page must not open an editor, nor take its `before` snapshot, before this is true.
     */
    isLoaded: computed(() => store._appStore.isAppConfigSettled() && store._appStore.appConfigResource.hasValue()),
    /** Admin of this tenant. */
    isAdmin: computed(() => hasRole('admin', store._appStore.currentUser())),
    /** The operator: `isOperator(user)` of util-core, which mirrors `firestore.rules` (admin of exactly `bka`). */
    isOperator: computed(() => isOperator(store._appStore.currentUser())),
  })),
  withMethods((store) => ({
    /**
     * The values of one group from the live `app-config` of the own tenant, every field defined. Reads a signal,
     * so a computed or template that calls it follows the stream. The caller keeps the result from the moment
     * the editor opened and passes it as `before` to `save`.
     */
    settings(group: SettingsGroupId): TenantSettings {
      return settingsOf(store._appStore.appConfig(), group);
    },

    /**
     * Saves the fields of `group` that differ between `before` (the settings at opening time) and `after`.
     * Writes nothing and logs nothing when nothing differs. Refuses `platform` to a non-operator and any
     * group to a non-admin. Fields of other groups never reach the database. One combined confirmation where
     * spec §7.4 wants one; cancelling saves nothing. A failed write is reported once by `FirestoreService`
     * and writes no activity. A failed activity log never fails the save.
     *
     * @param tenantId the tenant to write; the own tenant when omitted
     * @returns whether something was saved (so the caller keeps the editor's values when not)
     */
    async save(group: SettingsGroupId, before: TenantSettings, after: TenantSettings, tenantId?: string): Promise<boolean> {
      const own = store._appStore.tenantId();
      const target = tenantId || own;
      if (!target || !store.isAdmin()) return false;
      // another tenant's settings: only the operator, and only the platform fields
      if (target !== own && !(store.isOperator() && group === 'platform')) return false;
      // a snapshot taken from class defaults is wrong; see isLoaded
      if (target === own && !store.isLoaded()) return false;
      if (group === 'platform' && !store.isOperator()) return false;

      const diff = settingsDiff(before, after) as Record<string, unknown>;
      const inGroup = new Set<string>(SETTINGS_GROUPS[group] as readonly string[]);
      const changes = Object.fromEntries(Object.entries(diff).filter(([field]) => inGroup.has(field))) as TenantSettings;
      const names = Object.keys(changes);
      if (names.length === 0) return false;

      const needed = settingsConfirmations(changes, before);
      if (needed.length > 0) {
        const message = confirmationMessage(needed, {
          widen: store._texts.widen(), rebuild: store._texts.rebuild(), policy: store._texts.policy(),
          domain: store._texts.domain(), login: store._texts.login(), ask: store._texts.ask(),
        });
        if (!await store._alertService.confirm(message, true)) return false;
      }

      if (!await store._appConfigService.patch(target, changes)) return false;

      // not awaited: a hanging audit write must not delay a save that already succeeded
      const list = names.join(', ');
      void store._activityService.log('tenant', 'settings', store._appStore.currentUser(), target === own ? list : `${target}: ${list}`)
        .catch((error: unknown) => console.warn('TenantSettingsStore.save: the activity could not be logged', error));
      return true;
    },
  })),
);
