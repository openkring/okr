import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular/standalone';

import { ImageActions } from '@bk2/shared-categories';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { ImageActionType, ImageStyle, Slot } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Component({
  selector: 'bk-image-style',
  standalone: true,
  imports: [
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote,
    Checkbox, TextInput, StringSelect, CategoryOld, NumberInput
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <ion-note>{{ intro }}</ion-note>
          }
        }
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input [i18n]="imgIxParamsI18n()" [value]="imgIxParams()" (valueChange)="onFieldChange('imgIxParams', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="sizesI18n()" [value]="sizes()" (valueChange)="onFieldChange('sizes', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="borderI18n()" [value]="border()" (valueChange)="onFieldChange('border', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-text-input [i18n]="borderRadiusI18n()" [value]="borderRadius()" (valueChange)="onFieldChange('borderRadius', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="isThumbnailI18n()" [checked]="isThumbnail()" (checkedChange)="onFieldChange('isThumbnail', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
             <bk-string-select
                [i18n]="slotI18n()"
                [selectedString]="slot()"
                (selectedStringChange)="onFieldChange('slot', $event)"
                [readOnly]="readOnly()"
                [stringList]="stringList"
              />
            </ion-col>
            <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="fillI18n()" [checked]="fill()" (checkedChange)="onFieldChange('fill', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="hasPriorityI18n()" [checked]="hasPriority()" (checkedChange)="onFieldChange('hasPriority', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-category-old [i18n]="imageActionI18n()" [value]="action()" (valueChange)="onFieldChange('imageAction', $event)" [readOnly]="readOnly()" [categories]="imageActions" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-number-input [i18n]="zoomFactorI18n()" [value]="zoomFactor()" (valueChange)="onFieldChange('zoomFactor', $event)" [readOnly]="readOnly()" [showHelper]="true" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class ImageStyleConfiguration {
  private readonly i18nService = inject(I18nService);

  // inputs
  public formData = model.required<ImageStyle>();
  public title = input('@content.section.forms.imageStyle.title');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected imgIxParams = linkedSignal(() => this.formData().imgIxParams ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '160');
  protected height = linkedSignal(() => this.formData().height ?? '90');
  protected sizes = linkedSignal(() => this.formData().sizes ?? '(max-width: 1240px) 50vw, 300px');
  protected border = linkedSignal(() => this.formData().border ?? '1px');
  protected borderRadius = linkedSignal(() => this.formData().borderRadius ?? '4px');
  protected isThumbnail = linkedSignal(() => this.formData().isThumbnail ?? false);
  protected slot = linkedSignal(() => this.formData().slot ?? 'none');
  protected fill = linkedSignal(() => this.formData().fill ?? true);
  protected hasPriority = linkedSignal(() => this.formData().hasPriority ?? true);
  protected action = linkedSignal(() => this.formData().action ?? ImageActionType.None);
  protected zoomFactor = linkedSignal(() => this.formData().zoomFactor ?? 2);

  // passing constants to template
  protected imageActions = ImageActions;
  protected stringList = ['start', 'end', 'icon-only'];

  protected readonly fieldI18n = this.i18nService.translateAll({
    imgIxParams_label:       PFX + 'imgIxParams.label',
    imgIxParams_placeholder: PFX + 'imgIxParams.placeholder',
    imgIxParams_helper:      PFX + 'imgIxParams.helper',
    width_label:             PFX + 'width.label',
    width_placeholder:       PFX + 'width.placeholder',
    width_helper:            PFX + 'width.helper',
    height_label:            PFX + 'height.label',
    height_placeholder:      PFX + 'height.placeholder',
    height_helper:           PFX + 'height.helper',
    sizes_label:             PFX + 'sizes.label',
    sizes_placeholder:       PFX + 'sizes.placeholder',
    sizes_helper:            PFX + 'sizes.helper',
    border_label:            PFX + 'border.label',
    border_placeholder:      PFX + 'border.placeholder',
    border_helper:           PFX + 'border.helper',
    borderRadius_label:       PFX + 'borderRadius.label',
    borderRadius_placeholder: PFX + 'borderRadius.placeholder',
    borderRadius_helper:      PFX + 'borderRadius.helper',
    zoomFactor_label:         PFX + 'zoomFactor.label',
    zoomFactor_placeholder:   PFX + 'zoomFactor.placeholder',
    zoomFactor_helper:        PFX + 'zoomFactor.helper',
    slot_label:               PFX + 'imageSlot.label',
    imageAction_label:        PFX + 'imageAction.label',
    isThumbnail_label:        PFX + 'isThumbnail.label',
    isThumbnail_helper:       PFX + 'isThumbnail.helper',
    fill_label:               PFX + 'imageFill.label',
    fill_helper:              PFX + 'imageFill.helper',
    hasPriority_label:        PFX + 'hasPriority.label',
    hasPriority_helper:       PFX + 'hasPriority.helper',
  });

  protected imgIxParamsI18n = computed(() => ({
    name: 'imgIxParams',
    label: this.fieldI18n.imgIxParams_label(),
    placeholder: this.fieldI18n.imgIxParams_placeholder(),
    helper: this.fieldI18n.imgIxParams_helper(),
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

  protected sizesI18n = computed(() => ({
    name: 'sizes',
    label: this.fieldI18n.sizes_label(),
    placeholder: this.fieldI18n.sizes_placeholder(),
    helper: this.fieldI18n.sizes_helper(),
  } as TextInputI18n));

  protected borderI18n = computed(() => ({
    name: 'border',
    label: this.fieldI18n.border_label(),
    placeholder: this.fieldI18n.border_placeholder(),
    helper: this.fieldI18n.border_helper(),
  } as TextInputI18n));

  protected borderRadiusI18n = computed(() => ({
    name: 'borderRadius',
    label: this.fieldI18n.borderRadius_label(),
    placeholder: this.fieldI18n.borderRadius_placeholder(),
    helper: this.fieldI18n.borderRadius_helper(),
  } as TextInputI18n));

  protected zoomFactorI18n  = computed(() => ({ name: 'zoomFactor',   label: this.fieldI18n.zoomFactor_label(),  placeholder: this.fieldI18n.zoomFactor_placeholder(),  helper: this.fieldI18n.zoomFactor_helper()  } as NumberInputI18n));
  protected slotI18n        = computed(() => ({ name: 'slot',         label: this.fieldI18n.slot_label()        } as StringSelectI18n));
  protected imageActionI18n = computed(() => ({ name: 'imageAction',  label: this.fieldI18n.imageAction_label() } as CategoryOldI18n));

  protected isThumbnailI18n = computed(() => ({
    name: 'isThumbnail',
    label: this.fieldI18n.isThumbnail_label(),
    helper: this.fieldI18n.isThumbnail_helper(),
  } as CheckboxI18n));

  protected fillI18n = computed(() => ({
    name: 'fill',
    label: this.fieldI18n.fill_label(),
    helper: this.fieldI18n.fill_helper(),
  } as CheckboxI18n));

  protected hasPriorityI18n = computed(() => ({
    name: 'hasPriority',
    label: this.fieldI18n.hasPriority_label(),
    helper: this.fieldI18n.hasPriority_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | boolean | ImageActionType | Slot): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
