import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonNote } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * Shown instead of the chat while an admin has blocked it (spec 1.107, 7.4). Dumb: the host
 * resolves the i18n strings, picks the admin's message (or the default) and formats `since`.
 * No retry button — the chat comes back by itself when the block is lifted.
 */
@Component({
  selector: 'okr-chat-blocked-card',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon, IonNote],
  styles: [`
    ion-card-header { display: flex; flex-direction: row; align-items: center; gap: 12px; }
    ion-icon { font-size: 2rem; flex-shrink: 0; color: var(--ion-color-warning); }
    ion-card-title { font-size: 1.1rem; }
    .message { margin: 0 0 8px 0; white-space: pre-line; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-icon src="{{ icon() | svgIcon }}" aria-hidden="true" />
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <p class="message">{{ message() }}</p>
        @if (hasSince()) {
          <ion-note>{{ since() }}</ion-note>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class ChatBlockedCard {
  public readonly title = input.required<string>();
  public readonly message = input.required<string>();
  /** Already formatted, e.g. «gesperrt seit 19.10.2026 14:05»; empty hides the line. */
  public readonly since = input.required<string>();
  public readonly icon = input<string>('hammer');

  protected readonly hasSince = computed(() => this.since().trim().length > 0);
}
