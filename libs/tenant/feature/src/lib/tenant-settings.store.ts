import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';

import { ActivityService } from '@okr/activity-data-access';
import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { OPERATOR_TENANT_ID, hasRole } from '@okr/shared-util-core';
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
    /** Admin of this tenant. */
    isAdmin: computed(() => hasRole('admin', store._appStore.currentUser())),
    /** The operator: an admin whose own tenant is the operator tenant. The rules decide for real. */
    isOperator: computed(() => store._appStore.tenantId() === OPERATOR_TENANT_ID && hasRole('admin', store._appStore.currentUser())),
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
      if (group === 'platform' && !store.isOperator()) return false;

      const diff = settingsDiff(before, after) as Record<string, unknown>;
      const inGroup = new Set<string>(SETTINGS_GROUPS[group] as readonly string[]);
      const changes = Object.fromEntries(Object.entries(diff).filter(([field]) => inGroup.has(field))) as TenantSettings;
      const names = Object.keys(changes);
      if (names.length === 0) return false;

      const needed = settingsConfirmations(changes, before);
      if (needed.length > 0) {
        const message = confirmationMessage(needed, {
          widen: store._texts.widen(), rebuild: store._texts.rebuild(), policy: store._texts.policy(), ask: store._texts.ask(),
        });
        if (!await store._alertService.confirm(message, true)) return false;
      }

      if (!await store._appConfigService.patch(target, changes)) return false;

      try {
        const list = names.join(', ');
        await store._activityService.log('tenant', 'settings', store._appStore.currentUser(), target === own ? list : `${target}: ${list}`);
      } catch (error) {
        console.warn('TenantSettingsStore.save: the activity could not be logged', error);
      }
      return true;
    },
  })),
);
