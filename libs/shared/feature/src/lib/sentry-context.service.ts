import { effect, inject, Injectable } from '@angular/core';
import { clearSentryUser, setSentryUser } from '@bk2/shared-util-angular';
import type { Roles } from '@bk2/shared-models';
import { AppStore } from './app.store';

/**
 * Pushes pseudonymous user/tenant/role context into Sentry whenever the AppStore auth
 * state changes. Instantiate once after bootstrap (see app.config.ts). No PII (no email,
 * no name) is ever sent — only the Firebase UID, tenant id and roles.
 */
@Injectable({ providedIn: 'root' })
export class SentryContextService {
  private readonly appStore = inject(AppStore);

  constructor() {
    effect(() => {
      const uid = this.appStore.fbUser()?.uid;
      if (uid) {
        const rolesOrEmpty = this.appStore.roles();
        const roleNames: string[] = Array.isArray(rolesOrEmpty)
          ? rolesOrEmpty
          : (Object.keys(rolesOrEmpty) as (keyof Roles)[]).filter(
              (k) => rolesOrEmpty[k] === true,
            );
        setSentryUser(uid, this.appStore.tenantId(), roleNames);
      } else {
        clearSentryUser();
      }
    });
  }
}
