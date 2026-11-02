import { Component, computed, input, model, signal } from '@angular/core';

export interface PropertyListI18n {
  title: string;
  empty: string;
  /** label of the key field; defaults to «key» */
  keyLabel?: string;
  /** label of the value field; defaults to «value» */
  valueLabel?: string;
  /** label of the add button; defaults to «Add» */
  add?: string;
}

/** One selectable key of a property list with a fixed key vocabulary. */
export interface PropertyKeyOption {
  key: string;
  label: string;
}
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, IonSelect, IonSelectOption, ItemReorderEventDetail } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { LowercaseWordMask } from '@okr/shared-config';
import { BaseProperty } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getIndexOfKey } from '@okr/shared-util-core';

@Component({
  selector: 'okr-property-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    MaskitoDirective, FormsModule,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder, IonNote,
    IonSelect, IonSelectOption,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().title }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if (!readOnly() && (!hasKeyOptions() || availableKeyOptions().length > 0)) {
          <ion-item lines="none">
            @if (hasKeyOptions()) {
              <!-- fixed key vocabulary: the user picks the key, never types it -->
              <ion-select
                name="key"
                [value]="newKey()"
                (ionChange)="newKey.set($event.detail.value ?? '')"
                [label]="keyLabel()"
                labelPlacement="floating">
                @for (option of availableKeyOptions(); track option.key) {
                  <ion-select-option [value]="option.key">{{ option.label }}</ion-select-option>
                }
              </ion-select>
            } @else {
              <ion-input
                name="key"
                [ngModel]="newKey()"
                (ngModelChange)="newKey.set($event.detail.value)"
                [label]="keyLabel()"
                labelPlacement="floating"
                inputMode="text"
                type="text"
                [counter]="true"
                [maxlength]="20"
                placeholder="ssssss"
                [maskito]="wordMask()"
                [maskitoElement]="maskPredicate" />
            }
            <ion-input
              name="value"
              [ngModel]="newValue()"
              (ngModelChange)="newValue.set($event.detail.value)"
              [label]="valueLabel()"
              labelPlacement="floating"
              inputMode="text"
              type="text"
              [counter]="true"
              [maxlength]="50"
              [placeholder]="hasKeyOptions() ? '' : 'string | number | boolean'"/>
              <!-- tbd: input the type of the value; default: string -->
            <ion-button [disabled]="isDisabled()" (click)="add()">{{ addLabel() }}</ion-button>
          </ion-item>
        }

        @if(properties(); as properties) {
          @if(properties.length === 0) {
            <ion-item lines="none">
              <ion-note>{{ i18n().empty }}</ion-note>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="!canReorder()" (ionItemReorder)="reorder($any($event))">
                @for(property of properties; track property.key) {
                  <ion-item>
                    @if (canReorder()) {
                      <ion-reorder slot="start" />
                    }
                    <ion-label>{{ keyLabelOf(property.key) }}</ion-label>
                    <ion-label>{{ property.value }}</ion-label>
                    @if (!readOnly()) {
                      <ion-icon src="{{'cancel' | svgIcon }}" (click)="remove(property.key)" slot="end" />
                    }
                  </ion-item>
                }
              </ion-reorder-group>
            </ion-list>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class PropertyList {
  // inputs
  public properties = model.required<BaseProperty[]>(); // the keys of the menu items
  public i18n = input<PropertyListI18n>({ title: 'Eigenschaften', empty: 'Keine Eigenschaften' });
  public wordMask = input(LowercaseWordMask);
  /** a fixed key vocabulary: when non-empty the key is picked from this list instead of typed, and shown by its label */
  public keyOptions = input<PropertyKeyOption[]>([]);
  public readOnly = input(false);
  /** false for a keyed map where the order carries no meaning */
  public reorderable = input(true);

  // signals
  protected newKey = signal('');
  protected newValue = signal('');

  // fields
  protected isDisabled = computed(() => this.newKey() === '' || this.newValue() === '');
  protected hasKeyOptions = computed(() => this.keyOptions().length > 0);
  /** the options whose key is not in the list yet — a key can only be added once */
  protected availableKeyOptions = computed(() => {
    const used = new Set(this.properties().map((p) => p.key));
    return this.keyOptions().filter((o) => !used.has(o.key));
  });
  protected canReorder = computed(() => this.reorderable() && !this.readOnly());
  protected keyLabel = computed(() => this.i18n().keyLabel ?? 'key');
  protected valueLabel = computed(() => this.i18n().valueLabel ?? 'value');
  protected addLabel = computed(() => this.i18n().add ?? 'Add');

  // passing constants to template
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as unknown as HTMLIonInputElement).getInputElement();

  /** the label of a key from the fixed vocabulary; the key itself when it is not in it */
  protected keyLabelOf(key: string): string {
    return this.keyOptions().find((o) => o.key === key)?.label ?? key;
  }

  protected add(): void {
    if (this.newKey().length > 0 && this.newValue().length > 0 && this.properties()) {
      const properties = this.properties();
      // prevent adding duplicate keys
      if (getIndexOfKey(properties, this.newKey()) !== -1) {
        return;
      }
      // a NEW array: pushing into the existing one and setting the same reference back is
      // Object.is-equal, so the model output never fires and the parent never learns of the add
      this.properties.set([...properties, { key: this.newKey(), value: this.newValue() }]);
      this.resetInput();
    }
  }

  protected resetInput(): void {
    this.newKey.set('');
    this.newValue.set('');
  }

  protected remove(propertyKey: string): void {
    // splice() returns the REMOVED items — setting that kept exactly the one property the user
    // asked to delete and dropped all the others
    this.properties.set(this.properties().filter((property) => property.key !== propertyKey));
  }

/**
 * Finish the reorder and position the item in the DOM based on where the gesture ended.
 * @param ev the custom dom event with the reordered items
 */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.properties.set(ev.detail.complete(this.properties()));
  }
}

