// libs/content/pdf-template/ui/src/lib/versand-events-select.ts
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { IonItem, IonSelect, IonSelectOption } from '@ionic/angular';

import type { VersandEvent } from '@okr/content-pdf-template-util';

/**
 * The «Anlässe» field of a Versand: a multi-select over the offered events, each shown as
 * `when · name`. Presentational — the composer owns the chosen keys.
 */
@Component({
  selector: 'okr-versand-events-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonItem, IonSelect, IonSelectOption],
  template: `
    <ion-item lines="none">
      <ion-select name="caleventKeys"
        [label]="label()"
        [placeholder]="placeholder()"
        label-placement="floating"
        interface="popover"
        [multiple]="true"
        [value]="selected()"
        (ionChange)="onChange($event.detail.value)">
        @for (option of options(); track option.key) {
          <ion-select-option [value]="option.key">{{ option.text }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
  `,
})
export class VersandEventsSelect {
  // inputs
  public readonly events = input.required<VersandEvent[]>();
  public readonly label = input.required<string>();
  public readonly placeholder = input<string>('');

  /** the chosen `caleventKey`s */
  public readonly selected = model<string[]>([]);

  protected readonly options = computed(() =>
    this.events().map((event) => ({ key: event.caleventKey, text: `${event.when} · ${event.name}` })));

  protected onChange(value: unknown): void {
    this.selected.set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  }
}
