import { computed, inject, Signal } from '@angular/core';
import { patchState, signalStore, withMethods, withProps } from '@ngrx/signals';

import { I18nService } from '@bk2/shared-i18n';
import { PFX } from './scope';
import { AppStore } from '@bk2/shared-feature';
import { AuthService } from '@bk2/auth-data-access';
import { AlertService, navigateByUrl } from '@bk2/shared-util-angular';
import { Router } from '@angular/router';

const AUTH_I18N_KEYS = {
  title:                    PFX + 'title',
  email_label:              PFX + 'email.label',
  email_placeholder:        PFX + 'email.placeholder',
  email_error:              PFX + 'email.error',
  email_helper:             PFX + 'email.helper',
  password_label:           PFX + 'password.label',
  password_placeholder:     PFX + 'password.placeholder',
  password_error:           PFX + 'password.error',
  password_helper:          PFX + 'password.helper',
  pwdreset_title:           PFX + 'pwdreset.title',
  pwdconfirm:               PFX + 'pwdconfirm',
  newpwd:                   PFX + 'pwdreset.newpwd',
  invalid_link:             PFX + 'pwdreset.invalidLink',
  success:                  PFX + 'pwdreset.success',
  savepwd:                  PFX + 'pwdreset.savepwd',
  cancel:                   '@cancel',
  ok:                       '@ok',
  validation_emailRequired: '@validation.emailRequired',
  validation_passwordRequired: '@validation.passwordRequired',
} satisfies Record<string, string>;

export type AuthI18n = { [K in keyof typeof AUTH_I18N_KEYS]: Signal<string> };

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
