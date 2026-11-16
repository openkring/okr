import { Component, computed, input, model, signal, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonLabel, IonNote, IonRow,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption
} from '@ionic/angular';

import { Checkbox, CheckboxI18n, Color, ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { HERO_OVERLAY_DEFAULT, HeroConfig, HeroGradient, HeroOverlay, IMAGE_STYLE_SHAPE } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  getErrorSegments, getFieldErrors, HERO_FOCUSES, HERO_SEGMENT_FIELDS, HERO_HEIGHTS, HERO_OVERLAY_DARKENING_MAX, HERO_OVERLAY_FONT_SIZES, HERO_OVERLAY_LABEL_LENGTH,
  HERO_OVERLAY_POSITIONS, SectionErrors
} from '@okr/cms-section-util';

type Segment = 'image' | 'overlay' | 'layout';
type HeightMode = 'default' | 'px' | (typeof HERO_HEIGHTS)[number];

/** the pixel height a switch to «own value» starts from */
const DEFAULT_HEIGHT_PX = 400;

interface HeroConfigI18n {
  hero_title:                 Signal<string>;
  hero_subtitle:              Signal<string>;
  hero_segment_image:         Signal<string>;
  hero_segment_overlay:       Signal<string>;
  hero_segment_layout:        Signal<string>;
  segment_errors:             Signal<string>;
  hero_imgix_label:           Signal<string>;
  hero_imgix_placeholder:     Signal<string>;
  hero_imgix_helper:          Signal<string>;
  hero_show_title:            Signal<string>;
  hero_show_subtitle:         Signal<string>;
  hero_show_coords:           Signal<string>;
  hero_show_weather:          Signal<string>;
  hero_text_label:            Signal<string>;
  hero_text_placeholder:      Signal<string>;
  hero_text_helper:           Signal<string>;
  hero_position_label:        Signal<string>;
  hero_position_bottomLeft:   Signal<string>;
  hero_position_bottomCenter: Signal<string>;
  hero_position_center:       Signal<string>;
  hero_position_topLeft:      Signal<string>;
  hero_color:                 Signal<string>;
  hero_darkening_label:       Signal<string>;
  hero_darkening_placeholder: Signal<string>;
  hero_darkening_helper:      Signal<string>;
  hero_fontSize_label:        Signal<string>;
  hero_fontSize_s:            Signal<string>;
  hero_fontSize_m:            Signal<string>;
  hero_fontSize_l:            Signal<string>;
  hero_height_label:          Signal<string>;
  hero_height_default:        Signal<string>;
  hero_height_s:              Signal<string>;
  hero_height_m:              Signal<string>;
  hero_height_l:              Signal<string>;
  hero_height_full:           Signal<string>;
  hero_height_px:             Signal<string>;
  hero_heightPx_label:        Signal<string>;
  hero_heightPx_placeholder:  Signal<string>;
  hero_heightPx_helper:       Signal<string>;
  hero_focus_label:           Signal<string>;
  hero_focus_center:          Signal<string>;
  hero_focus_top:             Signal<string>;
  hero_focus_bottom:          Signal<string>;
  hero_focus_helper:          Signal<string>;
  hero_gradient_from:         Signal<string>;
  hero_gradient_to:           Signal<string>;
  hero_gradient_helper:       Signal<string>;
}

/** the band colours shown while a hero stores none: the app's primary and secondary colour */
function themeColor(name: 'primary' | 'secondary', fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--ion-color-${name}`).trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
}

/**
 * The look of a hero: the text laid over the image (which lines, where, colour, darkening, size),
 * its height and the part of the image that stays visible. The cover image itself is the hero's
 * own image card; here only the extra image parameters of the Bild segment.
 * Every setting is optional: a hero without them renders as it always did.
 */
@Component({
  selector: 'okr-hero-config',
  standalone: true,
  imports: [
    Checkbox, Color, ErrorNote, NumberInput, TextInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonSelect, IonSelectOption
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .error-dot { display: inline-block; width: 8px; height: 8px; margin-inline-start: 6px; border-radius: 50%; background: var(--ion-color-danger); vertical-align: middle; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().hero_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().hero_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
                @if (journalMode()) {
                  <ion-segment-button value="overlay">
                    <ion-label>{{ i18n().hero_segment_overlay() }}@if (hasErrors('overlay')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
                  </ion-segment-button>
                } @else {
                  <ion-segment-button value="image">
                    <ion-label>{{ i18n().hero_segment_image() }}@if (hasErrors('image')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
                  </ion-segment-button>
                }
                <ion-segment-button value="layout">
                  <ion-label>{{ i18n().hero_segment_layout() }}@if (hasErrors('layout')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-col>
          </ion-row>

          @switch (segment()) {
            @case ('image') {
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="imgixI18n()" [value]="imgIxParams()" (valueChange)="onImgIxParamsChange($event)"
                                  [maxLength]="200" [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('imgIxParams')" />
                </ion-col>
                <ion-col size="12">
                  <ion-note>{{ i18n().hero_gradient_helper() }}</ion-note>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-color [hexColor]="gradient().from" (hexColorChange)="onGradientChange('from', $event)"
                             [label]="i18n().hero_gradient_from()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsFor('gradient.from')" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-color [hexColor]="gradient().to" (hexColorChange)="onGradientChange('to', $event)"
                             [label]="i18n().hero_gradient_to()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsFor('gradient.to')" />
                </ion-col>
              </ion-row>
            }
            @case ('overlay') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showI18n().title" [checked]="overlay().title" (checkedChange)="onOverlayChange('title', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showI18n().subtitle" [checked]="overlay().subtitle" (checkedChange)="onOverlayChange('subtitle', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showI18n().coords" [checked]="overlay().coords" (checkedChange)="onOverlayChange('coords', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="showI18n().weather" [checked]="overlay().weather" (checkedChange)="onOverlayChange('weather', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="textI18n()" [value]="overlay().label" (valueChange)="onOverlayChange('label', $event)"
                                  [maxLength]="labelLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('overlay.label')" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().hero_position_label()" labelPlacement="stacked" [value]="overlay().position"
                              [disabled]="isReadOnly()" (ionChange)="onOverlayChange('position', $event.detail.value)">
                    @for (p of positions; track p) {
                      <ion-select-option [value]="p">{{ positionLabels()[p] }}</ion-select-option>
                    }
                  </ion-select>
                  <okr-error-note [errors]="errorsFor('overlay.position')" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().hero_fontSize_label()" labelPlacement="stacked" [value]="overlay().fontSize"
                              [disabled]="isReadOnly()" (ionChange)="onOverlayChange('fontSize', $event.detail.value)">
                    @for (s of fontSizes; track s) {
                      <ion-select-option [value]="s">{{ fontSizeLabels()[s] }}</ion-select-option>
                    }
                  </ion-select>
                  <okr-error-note [errors]="errorsFor('overlay.fontSize')" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-color [hexColor]="overlay().color" (hexColorChange)="onOverlayChange('color', $event)"
                             [label]="i18n().hero_color()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsFor('overlay.color')" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="darkeningI18n()" [value]="overlay().darkening" (valueChange)="onOverlayChange('darkening', $event)"
                                    [maxLength]="2" [integer]="true" [min]="0" [max]="darkeningMax" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsFor('overlay.darkening')" />
                </ion-col>
              </ion-row>
            }
            @case ('layout') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().hero_height_label()" labelPlacement="stacked" [value]="heightMode()"
                              [disabled]="isReadOnly()" (ionChange)="onHeightModeChange($event.detail.value)">
                    @for (m of heightModes; track m) {
                      <ion-select-option [value]="m">{{ heightLabels()[m] }}</ion-select-option>
                    }
                  </ion-select>
                  <okr-error-note [errors]="errorsFor('height')" />
                </ion-col>
                @if (heightMode() === 'px') {
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="heightPxI18n()" [value]="heightPx()" (valueChange)="onHeightPxChange($event)"
                                      [maxLength]="4" [integer]="true" [min]="1" [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                }
                <ion-col size="12" size-md="6">
                  <ion-select [label]="i18n().hero_focus_label()" labelPlacement="stacked" [value]="focus()"
                              [disabled]="isReadOnly()" (ionChange)="onFocusChange($event.detail.value)">
                    @for (f of focuses; track f) {
                      <ion-select-option [value]="f">{{ focusLabels()[f] }}</ion-select-option>
                    }
                  </ion-select>
                  <okr-error-note [errors]="errorsFor('focus')" />
                </ion-col>
              </ion-row>
            }
          }
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class HeroConfiguration {
  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});
  public readonly formData = model.required<HeroConfig>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<HeroConfigI18n>();
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /**
   * Travel journal (spec 1.154): the text overlay is drawn only there, with the footprint's title,
   * coordinates and weather, so only the journal offers it. Its photos are no imgix images, so the
   * journal does not offer the Bild segment (extra imgix parameters).
   */
  public readonly journalMode = input(false);

  protected readonly positions = HERO_OVERLAY_POSITIONS;
  protected readonly fontSizes = HERO_OVERLAY_FONT_SIZES;
  protected readonly focuses = HERO_FOCUSES;
  protected readonly heightModes: HeightMode[] = ['default', ...HERO_HEIGHTS, 'px'];
  protected readonly labelLength = HERO_OVERLAY_LABEL_LENGTH;
  protected readonly darkeningMax = HERO_OVERLAY_DARKENING_MAX;

  // until the user picks a segment, the card opens on the first one with errors (an invalid stored value is never
  // hidden behind a closed segment); a chosen segment that is not offered in this mode falls back the same way
  private readonly chosenSegment = signal<Segment | undefined>(undefined);
  private readonly offeredSegments = computed<Segment[]>(() => [this.journalMode() ? 'overlay' : 'image', 'layout']);
  protected readonly errorSegments = computed(() => getErrorSegments(this.errors(), HERO_SEGMENT_FIELDS, this.offeredSegments()));
  protected readonly segment = computed<Segment>(() => {
    const chosen = this.chosenSegment();
    if (chosen && this.offeredSegments().includes(chosen)) return chosen;
    return this.errorSegments()[0] ?? this.offeredSegments()[0];
  });

  // the form shows the defaults for an absent overlay; nothing is stored until the user changes a field
  protected readonly overlay = computed<HeroOverlay>(() => this.formData().overlay ?? HERO_OVERLAY_DEFAULT);
  protected readonly focus = computed(() => this.formData().focus ?? 'center');
  // an absent gradient shows primary / secondary (what the website draws then); stored once a colour is picked
  private readonly defaultGradient: HeroGradient = { from: themeColor('primary', '#009d53'), to: themeColor('secondary', '#014da2') };
  protected readonly gradient = computed<HeroGradient>(() => this.formData().gradient ?? this.defaultGradient);
  protected readonly imgIxParams = computed(() => this.formData().imageStyle?.imgIxParams ?? '');
  protected readonly heightMode = computed<HeightMode>(() => {
    const height = this.formData().height;
    return height === undefined ? 'default' : typeof height === 'number' ? 'px' : height;
  });
  protected readonly heightPx = computed(() => {
    const height = this.formData().height;
    return typeof height === 'number' ? height : DEFAULT_HEIGHT_PX;
  });

  // labels
  protected readonly imgixI18n = computed(() => ({
    name: 'imgIxParams', label: this.i18n().hero_imgix_label(), placeholder: this.i18n().hero_imgix_placeholder(), helper: this.i18n().hero_imgix_helper(),
  } as TextInputI18n));
  protected readonly textI18n = computed(() => ({
    name: 'overlayLabel', label: this.i18n().hero_text_label(), placeholder: this.i18n().hero_text_placeholder(), helper: this.i18n().hero_text_helper(),
  } as TextInputI18n));
  protected readonly darkeningI18n = computed(() => ({
    name: 'darkening', label: this.i18n().hero_darkening_label(), placeholder: this.i18n().hero_darkening_placeholder(), helper: this.i18n().hero_darkening_helper(),
  } as NumberInputI18n));
  protected readonly heightPxI18n = computed(() => ({
    name: 'heightPx', label: this.i18n().hero_heightPx_label(), placeholder: this.i18n().hero_heightPx_placeholder(), helper: this.i18n().hero_heightPx_helper(),
  } as NumberInputI18n));
  protected readonly showI18n = computed(() => ({
    title: { name: 'showTitle', label: this.i18n().hero_show_title(), helper: '' } as CheckboxI18n,
    subtitle: { name: 'showSubtitle', label: this.i18n().hero_show_subtitle(), helper: '' } as CheckboxI18n,
    coords: { name: 'showCoords', label: this.i18n().hero_show_coords(), helper: '' } as CheckboxI18n,
    weather: { name: 'showWeather', label: this.i18n().hero_show_weather(), helper: '' } as CheckboxI18n,
  }));
  protected readonly positionLabels = computed<Record<HeroOverlay['position'], string>>(() => ({
    'bottom-left': this.i18n().hero_position_bottomLeft(),
    'bottom-center': this.i18n().hero_position_bottomCenter(),
    'center': this.i18n().hero_position_center(),
    'top-left': this.i18n().hero_position_topLeft(),
  }));
  protected readonly fontSizeLabels = computed<Record<HeroOverlay['fontSize'], string>>(() => ({
    S: this.i18n().hero_fontSize_s(), M: this.i18n().hero_fontSize_m(), L: this.i18n().hero_fontSize_l(),
  }));
  protected readonly heightLabels = computed<Record<HeightMode, string>>(() => ({
    default: this.i18n().hero_height_default(),
    S: this.i18n().hero_height_s(), M: this.i18n().hero_height_m(), L: this.i18n().hero_height_l(),
    full: this.i18n().hero_height_full(), px: this.i18n().hero_height_px(),
  }));
  protected readonly focusLabels = computed<Record<NonNullable<HeroConfig['focus']>, string>>(() => ({
    center: this.i18n().hero_focus_center(), top: this.i18n().hero_focus_top(), bottom: this.i18n().hero_focus_bottom(),
  }));

  /************************************** actions *********************************************** */
  protected onSegmentChange(value: string | number | undefined): void {
    if (value === 'image' || value === 'overlay' || value === 'layout') this.chosenSegment.set(value);
  }

  protected onOverlayChange<K extends keyof HeroOverlay>(field: K, value: HeroOverlay[K]): void {
    this.formData.update((config) => ({ ...config, overlay: { ...(config.overlay ?? HERO_OVERLAY_DEFAULT), [field]: value } }));
  }

  protected onGradientChange(field: keyof HeroGradient, value: string): void {
    this.formData.update((config) => ({ ...config, gradient: { ...(config.gradient ?? this.defaultGradient), [field]: value } }));
  }

  protected onHeightModeChange(mode: HeightMode): void {
    this.formData.update((config) => {
      const { height: _removed, ...rest } = config;   // eslint-disable-line @typescript-eslint/no-unused-vars
      if (mode === 'default') return rest;
      return { ...rest, height: mode === 'px' ? this.heightPx() : mode };
    });
  }

  protected onHeightPxChange(value: number): void {
    this.formData.update((config) => ({ ...config, height: value }));
  }

  protected onFocusChange(focus: NonNullable<HeroConfig['focus']>): void {
    this.formData.update((config) => ({ ...config, focus }));
  }

  protected onImgIxParamsChange(value: string): void {
    this.formData.update((config) => ({ ...config, imageStyle: { ...(config.imageStyle ?? IMAGE_STYLE_SHAPE), imgIxParams: value } }));
  }

  /** whether a segment holds an error: its button gets a marker */
  protected hasErrors(segment: Segment): boolean {
    return this.errorSegments().includes(segment);
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
