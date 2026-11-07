import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';

import { PasskeyItem } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { PasskeyService, PreparedRegistration } from '@okr/auth-data-access';
import { AUTH_I18N_KEYS, passkeyErrorKind } from '@okr/auth-util';
import { confirm, createActionSheetButton, createActionSheetOptions, okrPrompt, showToast } from '@okr/shared-util-angular';

const MAX_LABEL = 40;
/** A prepared challenge lives 5 minutes on the server; stop using it a little earlier. */
const PREPARED_MAX_AGE_MS = 240_000;

interface PasskeyState {
  uid: string;
  items: PasskeyItem[];
  loading: boolean;
  canRegister: boolean;
}

/** Provided per component (not root): the profile accordion today, an admin modal later. */
export const PasskeyStore = signalStore(
  withState<PasskeyState>({ uid: '', items: [], loading: false, canRegister: false }),
  withProps(() => ({
    appStore: inject(AppStore),
    passkeyService: inject(PasskeyService),
    i18nService: inject(I18nService),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    actionSheetController: inject(ActionSheetController),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AUTH_I18N_KEYS),
  })),
  withMethods((store) => {
    let prepared: { options: PreparedRegistration; at: number } | undefined;

    /** Best effort: without prepared options, register() fetches them after the tap. */
    const prepareAdd = async (): Promise<void> => {
      try {
        prepared = { options: await store.passkeyService.prepareRegistration(), at: Date.now() };
      } catch {
        prepared = undefined;
      }
    };

    /** `quiet`: the initial load on every profile visit must not toast when offline or the function is unreachable. */
    const reload = async (quiet = false): Promise<void> => {
      const uid = store.uid();
      if (!uid) return;
      patchState(store, { loading: true });
      try {
        const items = await store.passkeyService.list(uid);
        if (store.uid() !== uid) return; // user switched while loading: drop the stale result
        patchState(store, { items });
      } catch (err) {
        if (quiet) console.warn('passkey list failed', err);
        else if (store.uid() === uid) await showToast(store.toastController, store.i18n.passkey_error());
      } finally {
        if (store.uid() === uid) patchState(store, { loading: false });
      }
    };

    const rename = async (item: PasskeyItem): Promise<void> => {
      const input = await okrPrompt(store.alertController, store.i18n.passkey_rename(), store.i18n.passkey_rename(), store.i18n.ok(), store.i18n.cancel(), item.label);
      const label = input?.trim();
      if (input === undefined) return; // cancelled
      if (!label || label.length > MAX_LABEL) {
        await showToast(store.toastController, store.i18n.passkey_error());
        return;
      }
      if (label === item.label) return;
      try {
        await store.passkeyService.rename(item.okey, label);
        await reload();
      } catch {
        await showToast(store.toastController, store.i18n.passkey_error());
      }
    };

    const remove = async (item: PasskeyItem): Promise<void> => {
      if (!(await confirm(store.alertController, store.i18n.passkey_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true))) return;
      try {
        await store.passkeyService.remove(item.okey);
        await reload();
        if (prepared) void prepareAdd(); // they exclude the passkey just deleted
      } catch {
        await showToast(store.toastController, store.i18n.passkey_error());
      }
    };

    return {
      async setUid(uid: string): Promise<void> {
        if (uid === store.uid()) return;
        patchState(store, { uid, items: [], canRegister: false, loading: false });
        let canRegister = false;
        try {
          canRegister = await store.passkeyService.canRegister();
        } catch {
          canRegister = false;
        }
        if (store.uid() !== uid) return; // superseded by a newer setUid
        patchState(store, { canRegister });
        await reload(true);
      },
      reload: (): Promise<void> => reload(),
      rename,
      remove,
      prepareAdd,

      async add(): Promise<void> {
        const options = prepared && Date.now() - prepared.at < PREPARED_MAX_AGE_MS ? prepared.options : undefined;
        prepared = undefined;
        try {
          await store.passkeyService.register(options);
          await showToast(store.toastController, store.i18n.passkey_added());
          await reload();
        } catch (err) {
          const kind = passkeyErrorKind(err);
          if (kind === 'cancelled') return;
          if (kind === 'exists') { await showToast(store.toastController, store.i18n.passkey_exists()); return; }
          await showToast(store.toastController, kind === 'unsupported' ? store.i18n.passkey_unavailable() : store.i18n.passkey_error());
        } finally {
          void prepareAdd();
        }
      },

      async showActions(item: PasskeyItem, ownerMode: boolean): Promise<void> {
        const imgix = store.appStore.services.imgixBaseUrl();
        const options = createActionSheetOptions(item.label);
        if (ownerMode) options.buttons.push(createActionSheetButton('passkey.rename', store.i18n.passkey_rename(), imgix, 'edit'));
        options.buttons.push(createActionSheetButton('passkey.delete', store.i18n.passkey_delete(), imgix, 'trash'));
        options.buttons.push(createActionSheetButton('cancel', store.i18n.cancel(), imgix, 'cancel'));
        const sheet = await store.actionSheetController.create(options);
        await sheet.present();
        const { data } = await sheet.onDidDismiss();
        if (!data) return;
        switch (data.action) {
          case 'passkey.rename': await rename(item); break;
          case 'passkey.delete': await remove(item); break;
        }
      },
    };
  })
);
