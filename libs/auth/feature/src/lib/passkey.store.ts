import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';

import { PasskeyItem } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { AuthService, PasskeyService } from '@okr/auth-data-access';
import { AUTH_I18N_KEYS, passkeyErrorKind } from '@okr/auth-util';
import { confirm, createActionSheetButton, createActionSheetOptions, okrPrompt, showToast } from '@okr/shared-util-angular';

const MAX_LABEL = 40;

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
    authService: inject(AuthService),
    i18nService: inject(I18nService),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    actionSheetController: inject(ActionSheetController),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AUTH_I18N_KEYS),
  })),
  withMethods((store) => {
    const reload = async (): Promise<void> => {
      const uid = store.uid();
      if (!uid) return;
      patchState(store, { loading: true });
      try {
        const items = await store.passkeyService.list(uid);
        patchState(store, { items });
      } catch {
        await showToast(store.toastController, store.i18n.passkey_error());
      } finally {
        patchState(store, { loading: false });
      }
    };

    /** Asks for the password, re-authenticates; false when cancelled or wrong. */
    const askReauth = async (): Promise<boolean> => {
      const password = await okrPrompt(store.alertController, store.i18n.passkey_reauth(), store.i18n.passkey_reauth(), store.i18n.ok(), store.i18n.cancel());
      if (!password) return false;
      const loginId = store.appStore.currentUser()?.loginId || undefined;
      return store.authService.reauthenticate(password, loginId);
    };

    const rename = async (item: PasskeyItem): Promise<void> => {
      const input = await okrPrompt(store.alertController, store.i18n.passkey_rename(), store.i18n.passkey_rename(), store.i18n.ok(), store.i18n.cancel(), item.label);
      const label = input?.trim();
      if (!label || label.length > MAX_LABEL || label === item.label) return;
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
      } catch {
        await showToast(store.toastController, store.i18n.passkey_error());
      }
    };

    return {
      async setUid(uid: string): Promise<void> {
        if (uid === store.uid()) return;
        patchState(store, { uid, items: [] });
        const canRegister = await store.passkeyService.canRegister();
        patchState(store, { canRegister });
        await reload();
      },
      reload,
      rename,
      remove,

      async add(): Promise<void> {
        let retried = false;
        for (;;) {
          try {
            await store.passkeyService.register();
            await showToast(store.toastController, store.i18n.passkey_added());
            await reload();
            return;
          } catch (err) {
            const kind = passkeyErrorKind(err);
            if (kind === 'cancelled') return;
            if (kind === 'exists') { await showToast(store.toastController, store.i18n.passkey_exists()); return; }
            if (kind === 'reauth' && !retried) {
              retried = true;
              if (await askReauth()) continue;
              return;
            }
            await showToast(store.toastController, kind === 'unsupported' ? store.i18n.passkey_unavailable() : store.i18n.passkey_error());
            return;
          }
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
