import { Component, computed, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonIcon, IonItem, IonLabel, IonNote, IonToggle } from '@ionic/angular/standalone';

import { ColorsIonic, getCategoryStringField } from '@okr/shared-categories';
import { ColorIonic } from '@okr/shared-models';
import { getSvgIconUrl } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';
import { ENV } from '@okr/shared-config';
export type CheckboxLabelPlacement = 'start' | 'end' | 'fixed';
export type CheckboxJustification = 'start' | 'end' | 'space-between';

export interface CheckboxI18n {
  name: string;
  label: string;
  helper: string;
}

@Component({
  selector: 'okr-checkbox',
  standalone: true,
  imports: [
    
    FormsModule,
    IonItem, IonCheckbox, IonNote, IonIcon, IonLabel, IonToggle
  ],
  template: `
    <ion-item lines="none">
      @if (leadingIconUrl().length > 0 && !isReadOnly()) {
        <ion-icon slot="start" [src]="leadingIconUrl()" />
      }
      @if (isReadOnly()) { <!-- read-only mode: just show icon and label -->
        <ion-label>
          <ion-icon slot="start" [src]="svgIconUrl()" />
          {{ i18n().label }}
        </ion-label>
      } @else if (isToggle()) { <!-- editable mode, toggle look: a switch instead of a box -->
        <ion-toggle
          [checked]="checked()"
          (ionChange)="onChange($event.detail.checked)"
          [name]="i18n().name"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [disabled]="isReadOnly()"
          [color]="colorName()"
        >
          <div class="ion-text-wrap">
            {{ i18n().label }}
          </div>
        </ion-toggle>
      } @else { <!-- editable mode: show checkbox -->
        <ion-checkbox required
          [checked]="checked()"
          (ionChange)="onChange($event.detail.checked)"
          [name]="i18n().name"
          [labelPlacement]="labelPlacement()"
          [justify]="justify()"
          [disabled]="isReadOnly()" 
          [color]="colorName()"
          [indeterminate]="isIndeterminate()"
        >
          <div class="ion-text-wrap">
            {{ i18n().label }}
          </div>
        </ion-checkbox>
      }
    </ion-item>
    @if(shouldShowHelper()) {
      <ion-item lines="none">
        <ion-note>{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class Checkbox {
  private env = inject(ENV);

  // model and explicit output
  public checked = model.required<boolean>(); // current value of the checkbox, two-way bound
  public checkedChange = output<boolean>();

  // inputs
  public i18n = input.required<CheckboxI18n>();
  public readOnly = input.required<boolean>();
  public color = input<ColorIonic>(ColorIonic.Secondary);
  public justify = input<'start'|'end'|'space-between'>('start');
  public showHelper = input<boolean>(false);
  public labelPlacement = input<'start'|'end'|'fixed'>('end'); // placement of the label
  public indeterminate = input<boolean>(false); // if true, the checkbox can be in indeterminate state
  /**
   * true: render an ion-toggle (switch) instead of the checkbox. Same model, same events — only
   * the look changes, which is why it is opt-in: every existing call site keeps its checkbox.
   */
  public toggle = input<boolean>(false);
  /** name of an icon rendered left of the control (editable mode); '' renders none. */
  public iconName = input('');

  // coerce the booleans
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected shouldShowHelper = computed(() => coerceBoolean(this.showHelper()));
  protected isIndeterminate = computed(() => coerceBoolean(this.indeterminate()));
  protected isToggle = computed(() => coerceBoolean(this.toggle()));

  // derived values
  protected colorName = computed(() => {
    if (!this.color() || this.color() === ColorIonic.White) return ''; 
    return getCategoryStringField(ColorsIonic, this.color(), 'name');
  });
  protected leadingIconUrl = computed(() => this.iconName().length > 0
    ? getSvgIconUrl(this.env.services.imgixBaseUrl, this.iconName())
    : '');
  protected svgIconUrl = computed(() => getSvgIconUrl(this.env.services.imgixBaseUrl, this.checked() ? 'checkbox-circle' : 'radio-button-off'));

// always emit change
  protected onChange(newValue: boolean): void {
    this.checked.set(newValue);
    this.checkedChange.emit(newValue);
  }
}
