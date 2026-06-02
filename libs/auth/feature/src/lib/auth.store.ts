import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { AppStore } from '@bk2/shared-feature';
import { AuthService } from '@bk2/auth-data-access';
import { AlertService, navigateByUrl } from '@bk2/shared-util-angular';
import { Router } from '@angular/router';
import { AUTH_I18N_KEYS, AuthI18n } from '@bk2/auth-util';

export type { AuthI18n };

export const AuthStore = signalStore(
  withProps(() => ({
    router: inject(Router),
    alertService: inject(AlertService),
    appStore: inject(AppStore),
    authService: inject(AuthService),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(AUTH_I18N_KEYS),
    config: computed(() => store.appStore.appConfig()),
    currentUser: computed(() => store.appStore.currentUser()),
    imgixBaseUrl: computed(() => store.appStore.services.imgixBaseUrl()),
    tenantId: computed(() => store.appStore.tenantId())
  })),
  withMethods((store) => {
    return {
      async resetPassword(loginEmail: string | undefined): Promise<void> {
        if (loginEmail) {
          await store.authService.resetPassword(loginEmail, store.config().loginUrl);
        }
      },
      async gotoHome(): Promise<void> {
        await navigateByUrl(store.router, store.config().rootUrl);
      },
      async confirmPasswordReset(oobCode: string, continueUrl: string, loginPassword: string): Promise<boolean> {
        const email = await store.authService.confirmPasswordReset(oobCode, loginPassword);
        if (email) {
          await store.alertService.showToast(`Passwort für ${email} wurde geändert.`);
          navigateByUrl(store.router, continueUrl);
          return true;
        } else {
          return false;
        }
      }
    }
  })

);
