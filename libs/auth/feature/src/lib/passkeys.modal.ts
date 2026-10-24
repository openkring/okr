import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { PasskeyList } from '@okr/auth-ui';
import { Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { PasskeyStore } from './passkey.store';

/**
 * Admin view of another user's passkeys (spec 1.120): list plus per-item delete. Read-only otherwise,
 * so it is no edit modal (no change-confirmation, see MODAL_ALLOWLIST in scripts/check-forms.mjs).
 */
@Component({
  selector: 'okr-passkeys-modal',
  standalone: true,
  imports: [Header, PasskeyList, IonContent],
  providers: [PasskeyStore],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <okr-passkey-list [items]="store.items()" [i18n]="store.i18n" (selected)="store.showActions($event, false)" />
    </ion-content>
  `,
})
export class PasskeysModal {
  protected readonly store = inject(PasskeyStore);

  // inputs
  public readonly uid = input.required<string>();
  public readonly name = input.required<string>();

  protected readonly title = computed(() => fill(this.store.i18n.passkey_modal_title(), { name: this.name() }));

  constructor() {
    effect(() => {
      const uid = this.uid();
      if (uid) untracked(() => void this.store.setUid(uid));
    });
  }
}
