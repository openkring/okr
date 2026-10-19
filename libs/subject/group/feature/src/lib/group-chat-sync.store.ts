import { inject } from '@angular/core';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { openReport } from '@okr/shared-ui';
import { showToast } from '@okr/shared-util-angular';
import { fill, hasRole } from '@okr/shared-util-core';

import { auditGroupRooms, pruneGroupRoomExtras, reconcileGroupRoomMembers, syncRoomPostPolicy } from '@okr/subject-group-data-access';
import { GROUP_I18N_KEYS, groupDriftFindings, GroupRoomDrift } from '@okr/subject-group-util';

function getFn() {
  return getFunctions(getApp(), 'europe-west6');
}

export type GroupChatSyncState = {
  /** a long-running loop is in flight; a second tap is ignored */
  busy: boolean;
};

/**
 * Repairs between the groups and their Matrix chat rooms, run from the group context menu
 * (moved here from the AOC chat page, spec 1.101 phase 2). Admin only on the client; the Cloud
 * Functions themselves also allow memberAdmin and groupAdmin.
 */
export const GroupChatSyncStore = signalStore(
  withState<GroupChatSyncState>({ busy: false }),
  withProps(() => ({
    appStore: inject(AppStore),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(GROUP_I18N_KEYS),
  })),
  withMethods((store) => {
    const isAdmin = () => hasRole('admin', store.appStore.currentUser());

    const confirm = async (header: string, message: string, action: string, danger = false): Promise<boolean> => {
      const alert = await store.alertController.create({
        header,
        message,
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: action, role: 'confirm', ...(danger ? { cssClass: 'danger' } : {}) },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      return role === 'confirm';
    };

    const fail = (e: unknown) => showToast(store.toastController, `${store.i18n.error()}: ${(e as Error).message}`);

    return {
      /**
       * Force-join every person with an active group membership into their group's Matrix room, for
       * all groups of this tenant. Additive only: it joins missing members and never removes anyone
       * (room members without a membership, e.g. course participants, are merely reported).
       *
       * Needed after the 2026-08-13 fix to grantsChatAccess, which used to treat a FUTURE membership
       * exit date as already-inactive and kicked those members from their rooms months early.
       */
      async repairMembers(): Promise<void> {
        if (!isAdmin() || store.busy()) return;
        const groups = store.appStore.allGroups();
        const confirmed = await confirm(
          store.i18n.chat_sync_members_title(),
          fill(store.i18n.chat_sync_members_confirm(), { count: groups.length }),
          store.i18n.chat_sync_members_action(),
        );
        if (!confirmed) return;

        patchState(store, { busy: true });
        try {
          const functions = getFn();
          let joined = 0;
          for (const group of groups) {
            try {
              joined += (await reconcileGroupRoomMembers(functions, group.okey)).joined.length;
            } catch (e) {
              // A group without a chat room throws; that is expected, not a failure of the run.
              console.warn(`reconcileGroupRoomMembers: skipped group ${group.okey}: ${(e as Error).message}`);
            }
          }
          await showToast(store.toastController, `${store.i18n.chat_sync_members_title()}: ${joined}`);
        } catch (e) {
          await fail(e);
        } finally {
          patchState(store, { busy: false });
        }
      },

      /**
       * Re-apply each group's write-permission setting to its Matrix room. Losing a privileged role
       * does not immediately revoke posting in an announcement-style room; a nightly job does. This
       * triggers the same reconciliation on demand. Only `privileged` groups can have anything to
       * do: `all` groups are not touched by the function without allowReset.
       */
      async syncPostPolicy(): Promise<void> {
        if (!isAdmin() || store.busy()) return;
        const groups = store.appStore.allGroups().filter(g => g.postPolicy === 'privileged');
        const confirmed = await confirm(
          store.i18n.chat_sync_postpolicy_title(),
          fill(store.i18n.chat_sync_postpolicy_confirm(), { count: groups.length }),
          store.i18n.chat_sync_postpolicy_action(),
        );
        if (!confirmed) return;

        patchState(store, { busy: true });
        try {
          const functions = getFn();
          let changed = 0;
          for (const group of groups) {
            try {
              if ((await syncRoomPostPolicy(functions, group.okey)).result === 'applied') changed++;
            } catch (e) {
              console.warn(`syncRoomPostPolicy: skipped group ${group.okey}: ${(e as Error).message}`);
            }
          }
          await showToast(store.toastController, `${store.i18n.chat_sync_postpolicy_title()}: ${changed}`);
        } catch (e) {
          await fail(e);
        } finally {
          patchState(store, { busy: false });
        }
      },

      /**
       * Report of the groups whose chat room holds people without a membership. Read-only until the
       * admin taps «Entfernen» on ONE group: a group may legitimately host non-members (course
       * participants), so who gets removed stays a per-group decision. After a prune the room is
       * audited again and the report re-opens; closing it (or following a finding) ends the loop.
       */
      async reviewGuests(): Promise<void> {
        if (!isAdmin() || store.busy()) return;
        const tenantId = store.appStore.tenantId();
        patchState(store, { busy: true });
        try {
          const functions = getFn();
          let drift: GroupRoomDrift[];
          try {
            drift = await auditGroupRooms(functions, tenantId);
          } catch (e) {
            await fail(e);
            return;
          }
          while (true) {
            const result = await openReport(store.modalController, {
              title: store.i18n.chat_sync_guests_title(),
              kind: 'check',
              explanation: store.i18n.chat_sync_guests_explanation(),
              findings: groupDriftFindings(drift, {
                extras: store.i18n.chat_sync_guests_extras(),
                missing: store.i18n.chat_sync_guests_missing(),
                prune: store.i18n.chat_sync_guests_prune(),
              }),
              ranAt: new Date(),
            });
            if (result?.kind !== 'action' || result.actionId !== 'prune') return;
            const target = drift.find(d => d.groupKey === result.findingId);
            if (!target || target.extras.length === 0) return;

            const confirmed = await confirm(
              store.i18n.chat_sync_guests_title(),
              fill(store.i18n.chat_sync_guests_confirm(), { count: target.extras.length, group: target.groupName }),
              store.i18n.chat_sync_guests_prune(),
              true,
            );
            if (!confirmed) continue; // back to the report

            try {
              // The function re-verifies every id against the current memberships, so a stale
              // report can never remove a real member.
              const { kicked } = await pruneGroupRoomExtras(functions, target.groupKey, target.extras.map(e => e.userId));
              await showToast(store.toastController, fill(store.i18n.chat_sync_guests_done(), { count: kicked.length }));
            } catch (e) {
              await fail(e);
              continue;
            }
            try {
              drift = await auditGroupRooms(functions, tenantId);
            } catch (e) {
              await fail(e);
              return;
            }
          }
        } finally {
          patchState(store, { busy: false });
        }
      },
    };
  }),
);
