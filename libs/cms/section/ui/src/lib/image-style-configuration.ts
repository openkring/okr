import { Component, computed, input, linkedSignal, model, Signal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular';

import { ImageActions } from '@okr/shared-categories';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { CUSTOM, DEFAULT_CROP_HEIGHT, IMAGE_STYLE_PRESETS, ImageDisplay, PresetField, SectionErrors, getFieldErrors, isFixedHeight, presetChoice } from '@okr/cms-section-util';
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
  display_label:           Signal<string>;
  display_helper:          Signal<string>;
  display_whole:           Signal<string>;
  display_crop:            Signal<string>;
  style_custom:            Signal<string>;
  width_full:              Signal<string>;
  width_half:              Signal<string>;
  width_fixed:             Signal<string>;
  border_none:             Signal<string>;
  border_thin:             Signal<string>;
  border_medium:           Signal<string>;
  borderRadius_square:     Signal<string>;
  borderRadius_small:      Signal<string>;
  borderRadius_medium:     Signal<string>;
  border_label:            Signal<string>;
  border_placeholder:      Signal<string>;
  border_helper:           Signal<string>;
  borderRadius_label:       Signal<string>;
  borderRadius_placeholder: Signal<string>;
  borderRadius_helper:      Signal<string>;
  slot_label:               Signal<string>;
  action_label:             Signal<string>;
  isThumbnail_label:        Signal<string>;
  isThumbnail_helper:       Signal<string>;
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
  imports: [NgTemplateOutlet, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonNote, Checkbox, TextInput, StringSelect, CategoryOld,
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
    @if(embedded()) {
      <ng-container *ngTemplateOutlet="groups" />
    } @else {
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().image_style_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          @if(intro(); as intro) { @if(intro.length > 0) {
          <ion-note>{{ intro }}</ion-note>
          } }
          <ng-container *ngTemplateOutlet="groups" />
        </ion-card-content>
      </ion-card>
    }

    <ng-template #groups>
        <ion-grid>
          <ion-row>
            <!-- the image settings are advanced ones: the defaults (whole image, full width, thin frame) fit nearly every case.
                 With essentials, Darstellung and Eckenradius always show; a hidden field with an error shows too. -->
            @if(showImageGroup() && (showAdvanced() || essentials())) {
            @if(showGroupTitles()) { <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_image() }}</div></ion-col> }
            @if(shows('height', true)) {
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="displayI18n()" [selectedString]="display()" (selectedStringChange)="onDisplayChange($event)" [readOnly]="readOnly()" [stringList]="displays" [labels]="displayLabels()" />
              </ion-col>
              @if(display() === 'crop') {
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('height')" />
                </ion-col>
              }
            }
            @if(shows('width')) {
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="widthPresetI18n()" [selectedString]="choice('width')" (selectedStringChange)="onPresetChange('width', $event)" [readOnly]="readOnly()" [stringList]="presetList('width')" [labels]="widthLabels()" />
                @if(choice('width') === custom) {
                  <okr-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                }
                <okr-error-note [errors]="errorsFor('width')" />
              </ion-col>
            }
            @if(shows('border')) {
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="borderPresetI18n()" [selectedString]="choice('border')" (selectedStringChange)="onPresetChange('border', $event)" [readOnly]="readOnly()" [stringList]="presetList('border')" [labels]="borderLabels()" />
                @if(choice('border') === custom) {
                  <okr-text-input [i18n]="borderI18n()" [value]="border()" (valueChange)="onFieldChange('border', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                }
                <okr-error-note [errors]="errorsFor('border')" />
              </ion-col>
            }
            @if(shows('borderRadius', true)) {
              <ion-col size="12" size-md="6">
                <okr-string-select [i18n]="borderRadiusPresetI18n()" [selectedString]="choice('borderRadius')" (selectedStringChange)="onPresetChange('borderRadius', $event)" [readOnly]="readOnly()" [stringList]="presetList('borderRadius')" [labels]="borderRadiusLabels()" />
                @if(choice('borderRadius') === custom) {
                  <okr-text-input [i18n]="borderRadiusI18n()" [value]="borderRadius()" (valueChange)="onFieldChange('borderRadius', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                }
                <okr-error-note [errors]="errorsFor('borderRadius')" />
              </ion-col>
            }
            @if(shows('isThumbnail') || shows('slot')) {
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
            }
            @if(shows('imgIxParams')) {
              <ion-col size="12">
                <okr-text-input [i18n]="imgIxParamsI18n()" [value]="imgIxParams()" (valueChange)="onFieldChange('imgIxParams', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('imgIxParams')" />
              </ion-col>
            }
            }
            @if(showCaption()) {
            @if(showGroupTitles()) { <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_caption() }}</div></ion-col> }
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
            }
            @if(showAction() && showAdvanced()) {
              @if(showGroupTitles()) { <ion-col size="12"><div class="group-title">{{ i18n().image_style_group_action() }}</div></ion-col> }
              <ion-col size="12" size-md="6">
                <okr-category-old [i18n]="imageActionI18n()" [value]="action()" (valueChange)="onFieldChange('action', $event)" [readOnly]="readOnly()" [categories]="imageActions" />
                <okr-error-note [errors]="errorsFor('action')" />
              </ion-col>
            }
          </ion-row>
        </ion-grid>
    </ng-template>
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
  /**
   * Which groups to show. The article's «Bilder» card (spec 1.154 §5) shows the caption and action groups
   * in its Layout segment and the image group in its Styles segment; every other section shows all three.
   */
  public readonly showImageGroup = input(true);
  public readonly showCaption = input(true);
  /** the action group additionally needs showAdvanced */
  public readonly showAction = input(true);
  /** inside a host card: no own card, title and intro */
  public readonly embedded = input(false);
  /** true: Darstellung and Eckenradius of the image group show without showAdvanced (the article's image block) */
  public readonly essentials = input(false);
  /** false: the host card already names the group */
  public readonly showGroupTitles = input(true);

  // fields
  protected imgIxParams = linkedSignal(() => this.formData().imgIxParams ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '100%');
  protected height = linkedSignal(() => this.formData().height ?? 'auto');
  protected border = linkedSignal(() => this.formData().border ?? '1px solid');
  protected borderRadius = linkedSignal(() => this.formData().borderRadius ?? '4px');
  protected isThumbnail = linkedSignal(() => this.formData().isThumbnail ?? false);
  protected slot = linkedSignal(() => this.formData().slot ?? 'none');
  protected captionPosition = linkedSignal<CaptionPosition>(() => this.formData().captionPosition ?? 'none');
  protected captionSize = linkedSignal(() => this.formData().captionSize ?? '0.8rem');
  protected captionStyle = linkedSignal<CaptionStyle>(() => this.formData().captionStyle ?? 'italic');
  protected captionAlign = linkedSignal<CaptionAlign>(() => this.formData().captionAlign ?? 'left');
  protected action = linkedSignal(() => this.formData().action ?? ImageActionType.OpenSlider);
  /** a real height is a crop; 'auto' (or nothing) is the whole image */
  protected display = computed<ImageDisplay>(() => isFixedHeight(this.height()) ? 'crop' : 'whole');
  /** fields whose «Eigener Wert» was picked while the stored value still equals a preset */
  private readonly customChosen = signal<ReadonlySet<PresetField>>(new Set());

  // passing constants to template
  protected imageActions = ImageActions;
  protected readonly custom = CUSTOM;
  protected readonly displays: ImageDisplay[] = ['whole', 'crop'];
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

  protected displayI18n = computed(() => ({ name: 'display', label: this.i18n().display_label(), helper: this.i18n().display_helper() } as StringSelectI18n));
  protected displayLabels = computed(() => [this.i18n().display_whole(), this.i18n().display_crop()]);
  protected widthPresetI18n = computed(() => ({ name: 'widthPreset', label: this.i18n().width_label() } as StringSelectI18n));
  protected widthLabels = computed(() => [this.i18n().width_full(), this.i18n().width_half(), this.i18n().width_fixed(), this.i18n().style_custom()]);
  protected borderPresetI18n = computed(() => ({ name: 'borderPreset', label: this.i18n().border_label() } as StringSelectI18n));
  protected borderLabels = computed(() => [this.i18n().border_none(), this.i18n().border_thin(), this.i18n().border_medium(), this.i18n().style_custom()]);
  protected borderRadiusPresetI18n = computed(() => ({ name: 'borderRadiusPreset', label: this.i18n().borderRadius_label() } as StringSelectI18n));
  protected borderRadiusLabels = computed(() => [this.i18n().borderRadius_square(), this.i18n().borderRadius_small(), this.i18n().borderRadius_medium(), this.i18n().style_custom()]);

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

  /** the presets of a field, followed by «Eigener Wert» */
  protected presetList(field: PresetField): string[] {
    return [...IMAGE_STYLE_PRESETS[field], CUSTOM];
  }

  /** the preset the stored value matches, else «Eigener Wert» */
  protected choice(field: PresetField): string {
    const value = String(this.formData()[field] ?? '');
    return this.customChosen().has(field) ? CUSTOM : presetChoice(field, value);
  }

  protected onPresetChange(field: PresetField, choice: string): void {
    const chosen = new Set(this.customChosen());
    if (choice === CUSTOM) chosen.add(field);
    else chosen.delete(field);
    this.customChosen.set(chosen);
    if (choice !== CUSTOM && choice !== this.formData()[field]) this.onFieldChange(field, choice);
  }

  /** a crop starts at 300px; the whole image is height 'auto' */
  protected onDisplayChange(display: string): void {
    if (display === this.display()) return;
    this.onFieldChange('height', display === 'crop' ? DEFAULT_CROP_HEIGHT : 'auto');
  }

  /** a field of the image group: advanced, or an essential one, or one that holds an error (it must never be hidden then) */
  protected shows(field: string, essential = false): boolean {
    return this.showAdvanced() || (essential && this.essentials()) || this.errorsFor(field).length > 0;
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
