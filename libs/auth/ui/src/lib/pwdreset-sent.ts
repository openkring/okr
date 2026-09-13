import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';

import { AuthI18n } from '@okr/auth-util';

/**
 * What the user sees once the password mail is on its way.
 *
 * This exists because the previous behaviour was a toast: a line that disappeared after a few
 * seconds and left the user in front of the same empty login form they had just acted on, with
 * nothing on screen saying a mail was coming or what to do next. A state that stays put can say
 * where the link went, how long it is good for, and offer the two ways out (send again, use a
 * different address) — none of which a toast can do.
 *
 * It deliberately does not promise delivery. The send is answered generically whether or not the
 * address belongs to an account (anti-enumeration, M-3), so the honest phrasing is "we sent a
 * link to this address", plus the spam hint and a way to reach a human.
 */
@Component({
  selector: 'okr-pwdreset-sent',
  standalone: true,
  imports: [SvgIconPipe, IonButton, IonIcon],
  styles: `
    :host { display: block; }
    .panel { display: flex; flex-direction: column; gap: 14px; text-align: left; padding: 4px 8px 8px; }
    .panel h2 { margin: 0; font-size: 1.375rem; font-weight: 700; line-height: 1.2; }
    .panel p { margin: 0; font-size: 0.9375rem; line-height: 1.5; }
    .mailto { font-weight: 600; }
    .muted { color: var(--ion-color-medium); font-size: 0.8125rem; }
    .actions { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
    ion-icon { font-size: 40px; color: var(--ion-color-primary); }
  `,
  template: `
    <div class="panel">
      <ion-icon src="{{ 'mail' | svgIcon }}" aria-hidden="true" />
      <h2>{{ i18n().sent_title() }}</h2>
      <p>{{ body() }}</p>
      <p class="muted">{{ i18n().sent_spam() }}</p>
      <div class="actions">
        <ion-button expand="block" fill="outline" (click)="resend.emit()">{{ i18n().sent_resend() }}</ion-button>
        <ion-button expand="block" fill="clear" (click)="useOther.emit()">{{ i18n().sent_other() }}</ion-button>
      </div>
      <p class="muted">{{ i18n().sent_help() }}</p>
    </div>
  `,
})
export class PwdResetSent {
  // inputs
  public readonly i18n = input.required<AuthI18n>();
  public readonly email = input.required<string>();
  /** True after the user asked for the link a second time — the text acknowledges that. */
  public readonly resent = input(false);

  // outputs
  public readonly resend = output<void>();
  public readonly useOther = output<void>();

  // computed
  // fill(), not a {{param}}: translateAll resolves keys through Transloco, which substitutes
  // double-brace params away to an empty string before we ever see them.
  protected body = computed(() =>
    fill(this.resent() ? this.i18n().sent_resent() : this.i18n().sent_body(), { email: this.email() }));
}
