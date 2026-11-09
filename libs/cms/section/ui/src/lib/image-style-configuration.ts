import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular';

import { ImageActions } from '@okr/shared-categories';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SectionErrors, getFieldErrors } from '@okr/cms-section-util';
import { CAPTION_ALIGNS, CAPTION_POSITIONS, CAPTION_STYLES, CaptionAlign, CaptionPosition, CaptionStyle, ImageActionType, ImageStyle, Slot } from '@okr/shared-models';

interface ImageStyleConfigI18n {
  image_style_title:        Signal<string>;
  imgIxParams_label:       Signal<string>;
  imgIxParams_placeholder: Signal<string>;
  imgIxParams_helper:      Signal<string>;
  width_label:             Signal<string>;
  width_placeholder:       Signal<string>;
  width_helper:            Signal<string>;
  height_label:            Signal<string>;
  height_placeholder:      Signal<string>;
  height_helper:           Signal<string>;
  sizes_label:             Signal<string>;
  sizes_placeholder:       Signal<string>;
  sizes_helper:            Signal<string>;
  border_label:            Signal<string>;
  border_placeholder:      Signal<string>;
  border_helper:           Signal<string>;
  borderRadius_label:       Signal<string>;
  borderRadius_placeholder: Signal<string>;
  borderRadius_helper:      Signal<string>;
  zoom_label:               Signal<string>;
  zoom_placeholder:         Signal<string>;
  zoom_helper:              Signal<string>;
  slot_label:               Signal<string>;
  action_label:             Signal<string>;
  isThumbnail_label:        Signal<string>;
  isThumbnail_helper:       Signal<string>;
  fill_label:               Signal<string>;
  fill_helper:              Signal<string>;
  hasPriority_label:        Signal<string>;
  hasPriority_helper:       Signal<string>;
  image_style_group_image:   Signal<string>;
  image_style_group_caption: Signal<string>;
  image_style_group_action:  Signal<string>;
  captionPosition_label:         Signal<string>;
  captionPosition_helper:        Signal<string>;
  captionPosition_none:          Signal<string>;
  captionPosition_top:           Signal<string>;
  captionPosition_bottom:        Signal<string>;
  captionPosition_topOverlay:    Signal<string>;
  captionPosition_middleOverlay: Signal<string>;
  captionPosition_bottomOverlay: Signal<string>;
  captionSize_label:             Signal<string>;
  captionSize_placeholder:       Signal<string>;
  captionSize_helper:            Signal<string>;
  captionStyle_label:            Signal<string>;
  captionStyle_helper:           Signal<string>;
  captionStyle_normal:           Signal<string>;
  captionStyle_italic:           Signal<string>;
  captionStyle_bold:             Signal<string>;
  captionStyle_boldItalic:       Signal<string>;
  captionAlign_label:            Signal<string>;
  captionAlign_helper:           Signal<string>;
  captionAlign_left:             Signal<string>;
  captionAlign_center:           Signal<string>;
  captionAlign_right:            Signal<string>;
}

@Component({
  selector: 'okr-image-style',
  standalone: true,
  imports: [IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote, Checkbox, TextInput, StringSelect, CategoryOld, NumberInput,
    ErrorNote
  ],
  styles: [
    `
      @media (width <= 600px) {
        ion-card {
          margin: 5px;
        }
      }
      .group-title { margin-top: 0.75rem; font-weight: 600; color: var(--ion-color-medium); }
    `,
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().image_style_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) { @if(intro.length > 0) {
        <ion-note>{{ intro }}</ion-note>
        } }
        <ion-grid>
          <ion-row>
            <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_image() }}</div></ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('width')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" />
              <okr-error-note [errors]="errorsFor('height')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-checkbox [i18n]="fillI18n()" [checked]="fill()" (checkedChange)="onFieldChange('fill', $event)" [readOnly]="readOnly()" [showHelper]="true" />
              <okr-error-note [errors]="errorsFor('fill')" />
            </ion-col>
            @if(showAdvanced()) {
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="borderI18n()" [value]="border()" (valueChange)="onFieldChange('border', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('border')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="borderRadiusI18n()" [value]="borderRadius()" (valueChange)="onFieldChange('borderRadius', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('borderRadius')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="hasPriorityI18n()" [checked]="hasPriority()" (checkedChange)="onFieldChange('hasPriority', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('hasPriority')" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="isThumbnailI18n()" [checked]="isThumbnail()" (checkedChange)="onFieldChange('isThumbnail', $event)" [readOnly]="readOnly()" />
                <okr-error-note [errors]="errorsFor('isThumbnail')" />
              </ion-col>
              @if(isThumbnail()) {
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="slotI18n()" [selectedString]="slot()" (selectedStringChange)="onFieldChange('slot', $event)" [readOnly]="readOnly()" [stringList]="stringList" />
                  <okr-error-note [errors]="errorsFor('slot')" />
                </ion-col>
              }
              <!-- technical settings for responsive loading and imgix; rarely needed -->
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="sizesI18n()" [value]="sizes()" (valueChange)="onFieldChange('sizes', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('sizes')" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="imgIxParamsI18n()" [value]="imgIxParams()" (valueChange)="onFieldChange('imgIxParams', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('imgIxParams')" />
              </ion-col>
            }
            <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_caption() }}</div></ion-col>
            <ion-col size="12" size-md="6">
              <okr-string-select [i18n]="captionPositionI18n()" [selectedString]="captionPosition()" (selectedStringChange)="onFieldChange('captionPosition', $event)" [readOnly]="readOnly()" [stringList]="captionPositions" [labels]="captionPositionLabels()" />
            </ion-col>
            @if(captionPosition() !== 'none') {
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="captionAlignI18n()" [selectedString]="captionAlign()" (selectedStringChange)="onFieldChange('captionAlign', $event)" [readOnly]="readOnly()" [stringList]="captionAligns" [labels]="captionAlignLabels()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="captionStyleI18n()" [selectedString]="captionStyle()" (selectedStringChange)="onFieldChange('captionStyle', $event)" [readOnly]="readOnly()" [stringList]="captionStyles" [labels]="captionStyleLabels()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="captionSizeI18n()" [value]="captionSize()" (valueChange)="onFieldChange('captionSize', $event)" [readOnly]="readOnly()" [showHelper]="true" />
              </ion-col>
            }
            @if(showAdvanced()) {
              <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_action() }}</div></ion-col>
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="imageActionI18n()" [value]="action()" (valueChange)="onFieldChange('action', $event)" [readOnly]="readOnly()" [categories]="imageActions" />
                <okr-error-note [errors]="errorsFor('action')" />
              </ion-col>
              @if(action() === imageActionZoom) {
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="zoomFactorI18n()" [value]="zoomFactor()" (valueChange)="onFieldChange('zoomFactor', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('zoomFactor')" />
                </ion-col>
              }
            }
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class ImageStyleConfiguration {
  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  public formData = model.required<ImageStyle>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly showAdvanced = input(false);
  public readonly i18n = input.required<ImageStyleConfigI18n>();

  // fields
  protected imgIxParams = linkedSignal(() => this.formData().imgIxParams ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '100%');
  protected height = linkedSignal(() => this.formData().height ?? 'auto');
  protected sizes = linkedSignal(() => this.formData().sizes ?? '(max-width: 1240px) 50vw, 300px');
  protected border = linkedSignal(() => this.formData().border ?? '1px solid');
  protected borderRadius = linkedSignal(() => this.formData().borderRadius ?? '4px');
  protected isThumbnail = linkedSignal(() => this.formData().isThumbnail ?? false);
  protected slot = linkedSignal(() => this.formData().slot ?? 'none');
  protected fill = linkedSignal(() => this.formData().fill ?? false);
  protected hasPriority = linkedSignal(() => this.formData().hasPriority ?? false);
  protected captionPosition = linkedSignal<CaptionPosition>(() => this.formData().captionPosition ?? 'none');
  protected captionSize = linkedSignal(() => this.formData().captionSize ?? '0.8rem');
  protected captionStyle = linkedSignal<CaptionStyle>(() => this.formData().captionStyle ?? 'italic');
  protected captionAlign = linkedSignal<CaptionAlign>(() => this.formData().captionAlign ?? 'left');
  protected action = linkedSignal(() => this.formData().action ?? ImageActionType.OpenSlider);
  protected zoomFactor = linkedSignal(() => this.formData().zoomFactor ?? 2);

  // passing constants to template
  protected imageActions = ImageActions;
  protected imageActionZoom = ImageActionType.Zoom;
  protected stringList = ['start', 'end', 'icon-only'];
  protected captionPositions = CAPTION_POSITIONS;
  protected captionStyles = CAPTION_STYLES;
  protected captionAligns = CAPTION_ALIGNS;

  protected imgIxParamsI18n = computed(
    () =>
      ({
        name: 'imgIxParams',
        label: this.i18n().imgIxParams_label(),
        placeholder: this.i18n().imgIxParams_placeholder(),
        helper: this.i18n().imgIxParams_helper(),
      } as TextInputI18n)
  );

  protected widthI18n = computed(
    () =>
      ({
        name: 'width',
        label: this.i18n().width_label(),
        placeholder: this.i18n().width_placeholder(),
        helper: this.i18n().width_helper(),
      } as TextInputI18n)
  );

  protected heightI18n = computed(
    () =>
      ({
        name: 'height',
        label: this.i18n().height_label(),
        placeholder: this.i18n().height_placeholder(),
        helper: this.i18n().height_helper(),
      } as TextInputI18n)
  );

  protected sizesI18n = computed(
    () =>
      ({
        name: 'sizes',
        label: this.i18n().sizes_label(),
        placeholder: this.i18n().sizes_placeholder(),
        helper: this.i18n().sizes_helper(),
      } as TextInputI18n)
  );

  protected borderI18n = computed(
    () =>
      ({
        name: 'border',
        label: this.i18n().border_label(),
        placeholder: this.i18n().border_placeholder(),
        helper: this.i18n().border_helper(),
      } as TextInputI18n)
  );

  protected borderRadiusI18n = computed(() =>({name: 'borderRadius', label: this.i18n().borderRadius_label(), placeholder: this.i18n().borderRadius_placeholder(), helper: this.i18n().borderRadius_helper()} as TextInputI18n));
  protected zoomFactorI18n = computed(() => ({ name: 'zoomFactor', label: this.i18n().zoom_label(), placeholder: this.i18n().zoom_placeholder(), helper: this.i18n().zoom_helper() } as NumberInputI18n));
  protected slotI18n = computed(() => ({ name: 'slot', label: this.i18n().slot_label() } as StringSelectI18n));
  protected imageActionI18n = computed(() => ({ name: 'imageAction', label: this.i18n().action_label() } as CategoryOldI18n));

  protected isThumbnailI18n = computed(
    () =>
      ({
        name: 'isThumbnail',
        label: this.i18n().isThumbnail_label(),
        helper: this.i18n().isThumbnail_helper(),
      } as CheckboxI18n)
  );

  protected fillI18n = computed(
    () =>
      ({
        name: 'fill',
        label: this.i18n().fill_label(),
        helper: this.i18n().fill_helper(),
      } as CheckboxI18n)
  );

  protected hasPriorityI18n = computed(
    () =>
      ({
        name: 'hasPriority',
        label: this.i18n().hasPriority_label(),
        helper: this.i18n().hasPriority_helper(),
      } as CheckboxI18n)
  );



  protected captionPositionI18n = computed(() => ({ name: 'captionPosition', label: this.i18n().captionPosition_label(), helper: this.i18n().captionPosition_helper() } as StringSelectI18n));
  protected captionPositionLabels = computed(() => [
    this.i18n().captionPosition_none(), this.i18n().captionPosition_top(), this.i18n().captionPosition_bottom(),
    this.i18n().captionPosition_topOverlay(), this.i18n().captionPosition_middleOverlay(), this.i18n().captionPosition_bottomOverlay(),
  ]);
  protected captionAlignI18n = computed(() => ({ name: 'captionAlign', label: this.i18n().captionAlign_label(), helper: this.i18n().captionAlign_helper() } as StringSelectI18n));
  protected captionAlignLabels = computed(() => [
    this.i18n().captionAlign_left(), this.i18n().captionAlign_center(), this.i18n().captionAlign_right(),
  ]);
  protected captionStyleI18n = computed(() => ({ name: 'captionStyle', label: this.i18n().captionStyle_label(), helper: this.i18n().captionStyle_helper() } as StringSelectI18n));
  protected captionStyleLabels = computed(() => [
    this.i18n().captionStyle_normal(), this.i18n().captionStyle_italic(),
    this.i18n().captionStyle_bold(), this.i18n().captionStyle_boldItalic(),
  ]);
  protected captionSizeI18n = computed(() => ({ name: 'captionSize', label: this.i18n().captionSize_label(), placeholder: this.i18n().captionSize_placeholder(), helper: this.i18n().captionSize_helper() } as TextInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | boolean | ImageActionType | Slot): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

/** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
