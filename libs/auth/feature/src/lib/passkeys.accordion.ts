import { Component, computed, effect, inject, input } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { IonAccordion, IonButton, IonItem, IonLabel } from '@ionic/angular';

import { PasskeyList } from '@okr/auth-ui';
import { PasskeyStore } from './passkey.store';

/** «Passkeys» panel of the profile page. Hidden on native, where passkeys are not offered. */
@Component({
  selector: 'okr-passkeys-accordion',
  standalone: true,
  imports: [PasskeyList, IonAccordion, IonItem, IonLabel, IonButton],
  providers: [PasskeyStore],
  template: `
    @if (visible) {
      <ion-accordion toggle-icon-slot="start" value="passkeys">
        <ion-item slot="header" [color]="color()">
          <ion-label>{{ store.i18n.passkey_title() }}</ion-label>
        </ion-item>
        <div slot="content">
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ store.i18n.passkey_intro() }}</ion-label>
          </ion-item>
          <okr-passkey-list [items]="store.items()" [i18n]="store.i18n" (selected)="store.showActions($event, true)" />
          @if (store.canRegister()) {
            <ion-button expand="block" class="ion-margin" [disabled]="store.loading()" (click)="store.add()">
              {{ store.i18n.passkey_add() }}
            </ion-button>
          } @else {
            <ion-item lines="none">
              <ion-label class="ion-text-wrap" color="medium">{{ store.i18n.passkey_unavailable() }}</ion-label>
            </ion-item>
          }
        </div>
      </ion-accordion>
    }
  `,
})
export class PasskeysAccordion {
  protected readonly store = inject(PasskeyStore);

  // inputs
  public readonly color = input('primary');

  protected readonly visible = !Capacitor.isNativePlatform();
  private readonly uid = computed(() => this.store.appStore.currentUser()?.okey ?? '');

  constructor() {
    effect(() => {
      const uid = this.uid();
      if (this.visible && uid) void this.store.setUid(uid);
    });
  }
}
