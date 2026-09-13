import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import { AuthService } from '@okr/auth-data-access';
import { AlertService, navigateByUrl } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { Router } from '@angular/router';
import { AUTH_I18N_KEYS, AuthI18n, PwdResetFailure } from '@okr/auth-util';

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
      /** @returns true when the request went through — never whether a mail was delivered (M-3). */
      async resetPassword(loginEmail: string | undefined): Promise<boolean> {
        if (!loginEmail) return false;
        return store.authService.resetPassword(loginEmail);
      },
      async gotoHome(): Promise<void> {
        await navigateByUrl(store.router, store.config().rootUrl);
      },
      /**
       * @returns undefined on success, otherwise why the attempt failed.
       *
       * On success the user is signed in here rather than sent to the login form: the verified
       * address comes back from confirmPasswordReset and the password was just typed, so the
       * second (and, from a browser tab, third) credential entry the old flow asked for was
       * work with no purpose. If the sign-in itself fails we fall back to `continueUrl`, which
       * is the login page — i.e. exactly where the flow used to end.
       */
      async confirmPasswordReset(oobCode: string, continueUrl: string, loginPassword: string): Promise<PwdResetFailure | undefined> {
        const result = await store.authService.confirmPasswordReset(oobCode, loginPassword);
        if (!result.ok) return result.reason;

        const signedIn = await store.authService.signInAfterPasswordSet(result.email, loginPassword);
        await store.alertService.showToast(fill(store.i18n.password_changed(), { email: result.email }));
        await navigateByUrl(store.router, signedIn ? store.config().rootUrl : continueUrl);
        return undefined;
      },

      /**
       * The address a reset link belongs to, or undefined when the link is not usable.
       * Called on load so a dead link is reported BEFORE the user chooses a password — the old
       * page only found out after they had typed one and pressed save.
       */
      async verifyResetCode(oobCode: string): Promise<{ email: string } | PwdResetFailure> {
        return store.authService.verifyResetCode(oobCode);
      },
      async gotoNewResetLink(): Promise<void> {
        await navigateByUrl(store.router, '/auth/pwdreset');
      },
      async gotoLogin(): Promise<void> {
        await navigateByUrl(store.router, store.config().loginUrl);
      }
    }
  })

);
