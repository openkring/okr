import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { AuthService } from '@okr/auth-data-access';
import { AlertService, navigateByUrl } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { Router } from '@angular/router';
import { AUTH_I18N_KEYS, AuthI18n } from '@okr/auth-util';

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
          await store.alertService.showToast(fill(store.i18n.password_changed(), { email }));
          navigateByUrl(store.router, continueUrl);
          return true;
        } else {
          return false;
        }
      }
    }
  })

);
