import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ButtonStyle, ColorIonic } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_LABEL, ICON_SIZE } from '@bk2/shared-constants';
import { ColorsIonic } from '@bk2/shared-categories';

interface ButtonStyleI18n {
  button_style_title:             Signal<string>;
  button_style_subtitle:          Signal<string>;
  button_label_label:             Signal<string>;
  button_label_placeholder:       Signal<string>;
  button_label_helper:            Signal<string>;
  button_style_width_label:       Signal<string>;
  button_style_width_placeholder: Signal<string>;
  button_style_width_helper:      Signal<string>;
  button_style_height_label:      Signal<string>;
  button_style_height_placeholder: Signal<string>;
  button_style_height_helper:     Signal<string>;
  button_style_shape_label:       Signal<string>;
  button_style_fill_label:        Signal<string>;
  button_style_color_label:       Signal<string>;
}

@Component({
  selector: 'bk-button-style',
  standalone: true,
  imports: [
    FormsModule,
    TextInput, CategoryOld,
    StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().button_style_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().button_style_subtitle() }}</ion-card-subtitle>
        </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }
        <ion-grid>
          <ion-row>
              <ion-col size="12">
                  <bk-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select [i18n]="shapeI18n()" [selectedString]="shape()" (selectedStringChange)="onFieldChange('shape', $event)" [readOnly]="readOnly()" [stringList]="['round', 'default']" />
              </ion-col>
              <ion-col size="12" size-md="6">
                  <bk-string-select [i18n]="fillI18n()" [selectedString]="fill()" (selectedStringChange)="onFieldChange('fill', $event)" [readOnly]="readOnly()" [stringList]="['clear', 'outline', 'solid']" />
              </ion-col>
              <ion-col size="12">
                  <bk-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                  <bk-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                  <bk-category-old [i18n]="colorI18n()" [value]="color()" (valueChange)="onFieldChange('color', $event)" [categories]="colors" [readOnly]="readOnly()" />
              </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ButtonStyleConfiguration {
  // inputs
  public formData = model.required<ButtonStyle>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public i18n = input.required<ButtonStyleI18n>();

  // fields
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected shape = linkedSignal(() => this.formData().shape ?? 'default');
  protected fill = linkedSignal(() => this.formData().fill ?? 'clear');
  protected width = linkedSignal(() => this.formData().width ?? ICON_SIZE);
  protected height = linkedSignal(() => this.formData().height ?? ICON_SIZE);
  protected color = linkedSignal(() => this.formData().color ?? ColorIonic.Primary);

  // passing constants to template
  protected colors = ColorsIonic;

  protected labelI18n = computed(() => ({
    name: 'label',
    label: this.i18n().button_label_label(),
    placeholder: this.i18n().button_label_placeholder(),
    helper: this.i18n().button_label_helper(),
  } as TextInputI18n));

  protected widthI18n = computed(() => ({
    name: 'width',
    label: this.i18n().button_style_width_label(),
    placeholder: this.i18n().button_style_width_placeholder(),
    helper: this.i18n().button_style_width_helper(),
  } as TextInputI18n));

  protected heightI18n = computed(() => ({
    name: 'height',
    label: this.i18n().button_style_height_label(),
    placeholder: this.i18n().button_style_height_placeholder(),
    helper: this.i18n().button_style_height_helper(),
  } as TextInputI18n));
  protected shapeI18n = computed(() => ({ name: 'shape', label: this.i18n().button_style_shape_label() } as StringSelectI18n));
  protected fillI18n  = computed(() => ({ name: 'fill',  label: this.i18n().button_style_fill_label()  } as StringSelectI18n));
  protected colorI18n = computed(() => ({ name: 'color', label: this.i18n().button_style_color_label() } as CategoryOldI18n));

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
