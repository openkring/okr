// libs/content/pdf-template/ui/src/lib/versand-events-select.ts
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonSelect, IonSelectOption } from '@ionic/angular';

import type { VersandEvent } from '@okr/content-pdf-template-util';
import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * The «Anlässe» field of a Versand: a picker over the events not yet chosen, followed by the
 * chosen events as a list — one per line, each shown as `when · name` with a button that
 * removes it again. Presentational — the composer owns the chosen keys.
 */
@Component({
  selector: 'okr-versand-events-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, SvgIconPipe],
  styles: [`
    .chosen ion-label { white-space: normal; }
  `],
  template: `
    @if (available().length > 0) {
      <ion-item lines="none">
        <ion-select #picker name="caleventKeys"
          [label]="label()"
          [placeholder]="placeholder()"
          label-placement="floating"
          interface="popover"
          (ionChange)="add(picker, $event.detail.value)">
          @for (option of available(); track option.key) {
            <ion-select-option [value]="option.key">{{ option.text }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
    }
    @if (chosen().length > 0) {
      <ion-list lines="inset" class="chosen">
        @for (option of chosen(); track option.key) {
          <ion-item>
            <ion-label>{{ option.text }}</ion-label>
            <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="removeLabel()" [title]="removeLabel()"
              (click)="remove(option.key)">
              <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
            </ion-button>
          </ion-item>
        }
      </ion-list>
    }
  `,
})
export class VersandEventsSelect {
  // inputs
  public readonly events = input.required<VersandEvent[]>();
  public readonly label = input.required<string>();
  public readonly placeholder = input<string>('');
  public readonly removeLabel = input<string>('');

  /** the chosen `caleventKey`s */
  public readonly selected = model<string[]>([]);

  private readonly options = computed(() =>
    this.events().map((event) => ({ key: event.caleventKey, text: `${event.when} · ${event.name}` })));

  /** the chosen events, in the order they were picked */
  protected readonly chosen = computed(() => {
    const byKey = new Map(this.options().map((option) => [option.key, option]));
    return this.selected().flatMap((key) => byKey.get(key) ?? []);
  });

  /** the events that can still be picked */
  protected readonly available = computed(() => {
    const chosen = new Set(this.selected());
    return this.options().filter((option) => !chosen.has(option.key));
  });

  protected add(picker: IonSelect, value: unknown): void {
    if (typeof value !== 'string' || value.length === 0) return;
    // the picker is an «add» control: clear it again so the chosen event only shows in the list
    picker.value = undefined;
    if (this.selected().includes(value)) return;
    this.selected.set([...this.selected(), value]);
  }

  protected remove(key: string): void {
    this.selected.set(this.selected().filter((k) => k !== key));
  }
}
