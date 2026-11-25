import { Component, input } from '@angular/core';
import { IonItem } from '@ionic/angular';

import type { MailEventLine } from '@okr/shared-util-core';

/**
 * The events of an events block in the canvas of a mail (spec 1.176 §8.2), as they are now; the mail lists those of its sending. In an
 * `ion-item`, as the texts around it.
 */
@Component({
  selector: 'okr-mail-events',
  standalone: true,
  imports: [IonItem],
  styles: [`
    /* the padding of the other blocks */
    :host { display: block; padding: 5px; }
    .events { width: 100%; min-width: 0; }
    .line { display: grid; grid-template-columns: 30% minmax(0, 1fr); gap: 12px; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
    p { margin: 0; }
    .what { min-width: 0; overflow-wrap: anywhere; }
    .place { opacity: 0.75; }
  `],
  template: `
    <ion-item lines="none" class="ion-no-padding">
      <div class="events">
        @if (title().trim(); as title) { <h2>{{ title }}</h2> }
        @for (line of lines(); track $index) {
          <div class="line">
            <p>{{ line.date }}@if (line.time) {<br />{{ line.time }}}</p>
            <p class="what"><strong>{{ line.title }}</strong>@if (line.place) {<br /><span class="place">{{ line.place }}</span>}</p>
          </div>
        }
      </div>
    </ion-item>
  `,
})
export class MailEvents {
  public readonly title = input('');
  public readonly lines = input.required<MailEventLine[]>();
}
