import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ButtonStyle, ColorIonic } from '@bk2/shared-models';
import { CategoryOld, CategoryOldI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { DEFAULT_LABEL, ICON_SIZE } from '@bk2/shared-constants';
import { ColorsIonic } from '@bk2/shared-categories';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
          <ion-card-title>{{ title() }}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() }}</ion-card-subtitle>
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
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<ButtonStyle>();
  public title = input('@content.section.type.button.style.title');
  public subTitle = input('@content.section.type.button.style.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected label = linkedSignal(() => this.formData().label ?? DEFAULT_LABEL);
  protected shape = linkedSignal(() => this.formData().shape ?? 'default');
  protected fill = linkedSignal(() => this.formData().fill ?? 'clear');
  protected width = linkedSignal(() => this.formData().width ?? ICON_SIZE);
  protected height = linkedSignal(() => this.formData().height ?? ICON_SIZE);
  protected color = linkedSignal(() => this.formData().color ?? ColorIonic.Primary);

  // passing constants to template
  protected colors = ColorsIonic;

  protected readonly fieldI18n = this.i18nService.translateAll({
    label_label:       PFX + 'label.label',
    label_placeholder: PFX + 'label.placeholder',
    label_helper:      PFX + 'label.helper',
    width_label:       PFX + 'width.label',
    width_placeholder: PFX + 'width.placeholder',
    width_helper:      PFX + 'width.helper',
    height_label:      PFX + 'height.label',
    height_placeholder: PFX + 'height.placeholder',
    height_helper:     PFX + 'height.helper',
    shape_label:       PFX + 'shape.label',
    fill_label:        PFX + 'fill.label',
    color_label:       PFX + 'color.label',
  });

  protected labelI18n = computed(() => ({
    name: 'label',
    label: this.fieldI18n.label_label(),
    placeholder: this.fieldI18n.label_placeholder(),
    helper: this.fieldI18n.label_helper(),
  } as TextInputI18n));

  protected widthI18n = computed(() => ({
    name: 'width',
    label: this.fieldI18n.width_label(),
    placeholder: this.fieldI18n.width_placeholder(),
    helper: this.fieldI18n.width_helper(),
  } as TextInputI18n));

  protected heightI18n = computed(() => ({
    name: 'height',
    label: this.fieldI18n.height_label(),
    placeholder: this.fieldI18n.height_placeholder(),
    helper: this.fieldI18n.height_helper(),
  } as TextInputI18n));
  protected shapeI18n = computed(() => ({ name: 'shape', label: this.fieldI18n.shape_label() } as StringSelectI18n));
  protected fillI18n  = computed(() => ({ name: 'fill',  label: this.fieldI18n.fill_label()  } as StringSelectI18n));
  protected colorI18n = computed(() => ({ name: 'color', label: this.fieldI18n.color_label() } as CategoryOldI18n));

  protected onFieldChange(fieldName: string, $event: string | string[] | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
