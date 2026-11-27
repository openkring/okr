import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { HeroConfig, HeroGradient, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, SECTION_CTA_STYLES, SectionCta, SectionCtaStyle, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Color, ErrorNote, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import {
  applyHeroCover, applyHeroHeight, applyHeroLogo, applyHeroLogoShape, applyHeroLogoSize, getFieldErrors, HERO_DEFAULT_HEIGHT_PX, HERO_FOCUSES,
  HERO_HEIGHT_CHOICES, HERO_LOGO_SHAPES, HERO_LOGO_SIZES, heroCtasOf, HeroEditorI18n, heroHasCover, heroHasLogo, HeroHeightChoice, heroHeightChoiceOf,
  HeroLogoShape, heroLogoShapeOf, HeroLogoSize, heroLogoSizeOf, removeHeroCta, SectionErrors, updateHeroCta,
} from '@okr/cms-section-util';

import { ImagesConfiguration } from './images-configuration';
import { heroSlotImages, slotErrors } from './hero-image-slot';

/** what of the hero the panel shows: the cover image, the logo or one of the buttons */
export type HeroPanelPart = 'cover' | 'logo' | 'button';
type Focus = NonNullable<HeroConfig['focus']>;

/** the band colours shown while a hero stores none: the app's primary and secondary colour */
function themeColor(name: 'primary' | 'secondary', fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--ion-color-${name}`).trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
}

/**
 * The settings of one part of a hero in the hero editor, shown while it is selected on the canvas:
 * - **cover**: the image, its height (S/M/L/whole screen) and focus; the gradient colours only while there is no image (only then the
 *   website draws them). Pixel height and extra imgix parameters behind «Für Fortgeschrittene».
 * - **logo**: the image, its size and shape; width, border and corner radius field by field behind «Anpassen».
 * - **button** (`buttonIndex`): label, link and look; remove.
 * Every choice writes the stored `HeroConfig` fields (`hero-presets.util.ts`), so readers draw as before. Every change sets `config` once.
 */
@Component({
  selector: 'okr-hero-panel',
  standalone: true,
  imports: [
    SvgIconPipe, Color, ErrorNote, ImagesConfiguration, NumberInput, TextInput,
    IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  styles: [`
    .field-label { display: block; margin: 14px 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .field-label.first { margin-top: 0; }
    .note { display: block; margin-top: 6px; font-size: 0.85rem; }
    .choices { display: flex; flex-wrap: wrap; gap: 6px; }
    .choice { min-height: 32px; padding: 4px 12px; font: inherit; font-size: 0.85rem; color: var(--ion-text-color); background: transparent;
      border: 1px solid var(--ion-color-light-shade); border-radius: 16px; cursor: pointer; }
    .choice.current { border: 2px solid var(--ion-color-primary); padding: 3px 11px; color: var(--ion-color-primary); }
    .looks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .look { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; font: inherit; font-size: 0.75rem;
      color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .look.current { border: 2px solid var(--ion-color-primary); padding: 7px 3px; }
    .sample { display: flex; align-items: center; justify-content: center; height: 28px; padding: 0 12px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; }
    .sample.primary { background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    .sample.secondary { border: 1.5px solid var(--ion-color-secondary); color: var(--ion-color-secondary); }
    .colors { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    ion-segment-button { min-width: 0; --padding-start: 2px; --padding-end: 2px; text-transform: none; letter-spacing: 0; font-size: 0.85rem; }
    .custom { display: flex; align-items: center; justify-content: space-between; }
  `],
  template: `
    @let t = i18n();
    @switch (part()) {
      @case ('cover') {
        <ion-card>
          <ion-card-content>
            <okr-images-config [images]="coverImages()" (imagesChange)="setCover($event)" [multiple]="false" [embedded]="true"
              [emptyText]="t.hero_empty()" [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="readOnly()" [i18n]="t" />
            <okr-error-note [errors]="coverErrors()" />

            <span class="field-label">{{ t.hero_height_label() }}</span>
            <div class="choices" role="radiogroup" [attr.aria-label]="t.hero_height_label()">
              @for (h of heightChoices; track h) {
                <button type="button" class="choice" role="radio" [class.current]="h === height()" [attr.aria-checked]="h === height()" [disabled]="readOnly()" (click)="setHeight(h)">{{ heightLabels()[h] }}</button>
              }
            </div>
            @if (height() === 'px') { <ion-note class="note">{{ t.hero_editor_height_own() }}</ion-note> }
            <okr-error-note [errors]="errorsFor('height')" />

            @if (hasCover()) {
              <span class="field-label">{{ t.hero_focus_label() }}</span>
              <ion-segment [value]="focus()" [disabled]="readOnly()" [attr.aria-label]="t.hero_focus_label()" (ionChange)="setFocus($event.detail.value)">
                @for (f of focuses; track f) { <ion-segment-button [value]="f"><ion-label>{{ focusLabels()[f] }}</ion-label></ion-segment-button> }
              </ion-segment>
              <ion-note class="note">{{ t.hero_focus_helper() }}</ion-note>
              <okr-error-note [errors]="errorsFor('focus')" />
            }
            <!-- the band of a hero without image: only then the website draws it, so only then it is offered (an invalid stored value always shows) -->
            @if (!hasCover() || gradientErrors().length > 0) {
              <span class="field-label">{{ t.hero_editor_gradient_title() }}</span>
              <div class="colors">
                <okr-color [hexColor]="gradient().from" (hexColorChange)="setGradient('from', $event)" [label]="t.hero_gradient_from()" [readOnly]="readOnly()" />
                <okr-color [hexColor]="gradient().to" (hexColorChange)="setGradient('to', $event)" [label]="t.hero_gradient_to()" [readOnly]="readOnly()" />
              </div>
              <ion-note class="note">{{ t.hero_gradient_helper() }}</ion-note>
              <okr-error-note [errors]="gradientErrors()" />
            }
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="custom">
            <ion-label>
              <strong>{{ t.hero_editor_advanced_title() }}</strong>
              <ion-note class="note">{{ t.hero_editor_advanced_helper() }}</ion-note>
            </ion-label>
            <ion-button fill="clear" size="small" [attr.aria-expanded]="advancedShown()" [attr.aria-label]="t.hero_editor_advanced_title()" (click)="advancedOpen.set(!advancedShown())">
              <ion-icon slot="icon-only" src="{{ (advancedShown() ? 'chevron-up' : 'chevron-down') | svgIcon }}" aria-hidden="true" />
            </ion-button>
          </ion-card-content>
          @if (advancedShown()) {
            <ion-card-content>
              <okr-number-input [i18n]="heightPxI18n()" [value]="heightPx()" (valueChange)="setHeightPx($event)"
                [maxLength]="4" [integer]="true" [min]="1" [showHelper]="true" [readOnly]="readOnly()" />
              <okr-text-input [i18n]="imgixI18n()" [value]="style().imgIxParams" (valueChange)="setStyle('imgIxParams', $event)"
                [maxLength]="200" [readOnly]="readOnly()" [showHelper]="true" />
              <okr-error-note [errors]="errorsFor('imgIxParams')" />
            </ion-card-content>
          }
        </ion-card>
      }

      @case ('logo') {
        <ion-card>
          <ion-card-content>
            <okr-images-config [images]="logoImages()" (imagesChange)="setLogo($event)" [multiple]="false" [embedded]="true"
              [emptyText]="t.hero_logo_empty()" [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="readOnly()" [i18n]="t" />
            <okr-error-note [errors]="logoErrors()" />

            @if (hasLogo()) {
              <span class="field-label">{{ t.hero_editor_logo_size_title() }}</span>
              <ion-segment [value]="logoSize() ?? ''" [disabled]="readOnly()" [attr.aria-label]="t.hero_editor_logo_size_title()" (ionChange)="setLogoSize($event.detail.value)">
                @for (s of logoSizes; track s) { <ion-segment-button [value]="s"><ion-label>{{ logoSizeLabels()[s] }}</ion-label></ion-segment-button> }
              </ion-segment>
              <span class="field-label">{{ t.hero_editor_logo_shape_title() }}</span>
              <ion-segment [value]="logoShape() ?? ''" [disabled]="readOnly()" [attr.aria-label]="t.hero_editor_logo_shape_title()" (ionChange)="setLogoShape($event.detail.value)">
                @for (s of logoShapes; track s) { <ion-segment-button [value]="s"><ion-label>{{ logoShapeLabels()[s] }}</ion-label></ion-segment-button> }
              </ion-segment>
              @if (!logoSize() || !logoShape()) { <ion-note class="note">{{ t.hero_editor_logo_own() }}</ion-note> }
            }
          </ion-card-content>
        </ion-card>

        @if (hasLogo() || logoStyleErrors().length > 0) {
          <ion-card>
            <ion-card-content class="custom">
              <ion-label>
                <strong>{{ t.hero_editor_logo_custom_title() }}</strong>
                <ion-note class="note">{{ t.hero_editor_logo_custom_helper() }}</ion-note>
              </ion-label>
              <ion-button fill="clear" size="small" [attr.aria-expanded]="logoCustomShown()" [attr.aria-label]="t.hero_editor_logo_custom_title()" (click)="logoCustomOpen.set(!logoCustomShown())">
                <ion-icon slot="icon-only" src="{{ (logoCustomShown() ? 'chevron-up' : 'chevron-down') | svgIcon }}" aria-hidden="true" />
              </ion-button>
            </ion-card-content>
            @if (logoCustomShown()) {
              <ion-card-content>
                <okr-text-input [i18n]="widthI18n()" [value]="style().width" (valueChange)="setStyle('width', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('width')" />
                <okr-text-input [i18n]="borderI18n()" [value]="style().border" (valueChange)="setStyle('border', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('border')" />
                <okr-text-input [i18n]="borderRadiusI18n()" [value]="style().borderRadius" (valueChange)="setStyle('borderRadius', $event)" [readOnly]="readOnly()" [showHelper]="true" />
                <okr-error-note [errors]="errorsFor('borderRadius')" />
              </ion-card-content>
            }
          </ion-card>
        }
      }

      @case ('button') {
        @if (cta(); as cta) {
          <ion-card>
            <ion-card-content>
              <okr-text-input [i18n]="labelI18n()" [value]="cta.label ?? ''" (valueChange)="setCta({ label: $event })"
                [maxLength]="labelLength" [readOnly]="readOnly()" [showHelper]="true" />
              <okr-error-note [errors]="errorsFor('ctas[' + buttonIndex() + '].label')" />
              <okr-text-input [i18n]="urlI18n()" [value]="cta.url ?? ''" (valueChange)="setCta({ url: $event })"
                [maxLength]="urlLength" [readOnly]="readOnly()" [showHelper]="true" inputMode="url" />
              <okr-error-note [errors]="errorsFor('ctas[' + buttonIndex() + '].url')" />

              <span class="field-label">{{ t.cta_style_label() }}</span>
              <div class="looks" role="radiogroup" [attr.aria-label]="t.cta_style_label()">
                @for (s of ctaStyles; track s) {
                  <button type="button" class="look" role="radio" [class.current]="s === (cta.style ?? 'primary')" [attr.aria-checked]="s === (cta.style ?? 'primary')"
                    [disabled]="readOnly()" (click)="setCta({ style: s })">
                    <span [class]="'sample ' + s">Aa</span>{{ styleLabels()[s] }}
                  </button>
                }
              </div>
            </ion-card-content>
          </ion-card>
          @if (!readOnly()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="removeCta()">
              <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" aria-hidden="true" />{{ t.cta_remove() }}
            </ion-button>
          }
        }
      }
    }
  `,
})
export class HeroPanel {
  // inputs
  public readonly part = input.required<HeroPanelPart>();
  public readonly config = input.required<HeroConfig>();
  /** the button shown while `part` is 'button' */
  public readonly buttonIndex = input(0);
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(false);
  public readonly i18n = input.required<HeroEditorI18n>();

  // outputs
  public readonly configChange = output<HeroConfig>();

  // constants for the template
  protected readonly heightChoices = HERO_HEIGHT_CHOICES.filter((choice) => choice !== 'px');
  protected readonly focuses = HERO_FOCUSES;
  protected readonly logoSizes = HERO_LOGO_SIZES;
  protected readonly logoShapes = HERO_LOGO_SHAPES;
  protected readonly ctaStyles = SECTION_CTA_STYLES;
  /** kept in step with the caps the Vest suite and the former form use */
  protected readonly labelLength = NAME_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  // cover
  protected readonly coverImages = computed(() => heroSlotImages(this.config().hero));
  protected readonly coverErrors = computed(() => slotErrors(this.errors(), 'hero'));
  protected readonly hasCover = computed(() => heroHasCover(this.config()));
  protected readonly height = computed(() => heroHeightChoiceOf(this.config().height));
  protected readonly heightPx = computed(() => {
    const height = this.config().height;
    return typeof height === 'number' ? height : HERO_DEFAULT_HEIGHT_PX;
  });
  protected readonly focus = computed<Focus>(() => this.config().focus ?? 'center');
  private readonly defaultGradient: HeroGradient = { from: themeColor('primary', '#009d53'), to: themeColor('secondary', '#014da2') };
  protected readonly gradient = computed<HeroGradient>(() => this.config().gradient ?? this.defaultGradient);
  protected readonly gradientErrors = computed(() => ['gradient.from', 'gradient.to'].flatMap((field) => this.errorsFor(field)));
  protected readonly style = computed<ImageStyle>(() => ({ ...IMAGE_STYLE_SHAPE, ...(this.config().imageStyle ?? {}) }));
  protected readonly advancedOpen = signal(false);
  /** open by itself while a pixel height is stored or its fields hold an error: what is set or wrong is never hidden */
  protected readonly advancedShown = computed(() => this.advancedOpen() || this.height() === 'px' || this.errorsFor('imgIxParams').length > 0);

  // logo
  protected readonly logoImages = computed(() => heroSlotImages(this.config().logo));
  protected readonly logoErrors = computed(() => slotErrors(this.errors(), 'logo'));
  protected readonly hasLogo = computed(() => heroHasLogo(this.config()));
  protected readonly logoSize = computed(() => heroLogoSizeOf(this.config()));
  protected readonly logoShape = computed(() => heroLogoShapeOf(this.config()));
  protected readonly logoStyleErrors = computed(() => ['width', 'border', 'borderRadius'].flatMap((field) => this.errorsFor(field)));
  protected readonly logoCustomOpen = signal(false);
  protected readonly logoCustomShown = computed(() => this.logoCustomOpen() || this.logoStyleErrors().length > 0);

  // button
  protected readonly cta = computed<SectionCta | undefined>(() => heroCtasOf(this.config())[this.buttonIndex()]);

  // texts
  protected readonly heightLabels = computed<Record<HeroHeightChoice, string>>(() => {
    const t = this.i18n();
    return { default: t.hero_height_default(), S: t.hero_height_s(), M: t.hero_height_m(), L: t.hero_height_l(), full: t.hero_height_full(), px: t.hero_height_px() };
  });
  protected readonly focusLabels = computed<Record<Focus, string>>(() => {
    const t = this.i18n();
    return { center: t.hero_focus_center(), top: t.hero_focus_top(), bottom: t.hero_focus_bottom() };
  });
  protected readonly logoSizeLabels = computed<Record<HeroLogoSize, string>>(() => {
    const t = this.i18n();
    return { s: t.hero_editor_logo_size_s(), m: t.hero_editor_logo_size_m(), l: t.hero_editor_logo_size_l() };
  });
  protected readonly logoShapeLabels = computed<Record<HeroLogoShape, string>>(() => {
    const t = this.i18n();
    return { square: t.hero_editor_logo_shape_square(), rounded: t.hero_editor_logo_shape_rounded(), round: t.hero_editor_logo_shape_round() };
  });
  protected readonly styleLabels = computed<Record<SectionCtaStyle, string>>(() => ({
    primary: this.i18n().cta_style_primary(), secondary: this.i18n().cta_style_secondary(),
  }));
  protected readonly heightPxI18n = computed<NumberInputI18n>(() => ({
    name: 'heightPx', label: this.i18n().hero_heightPx_label(), placeholder: this.i18n().hero_heightPx_placeholder(), helper: this.i18n().hero_heightPx_helper(),
  }));
  protected readonly imgixI18n = computed<TextInputI18n>(() => ({
    name: 'imgIxParams', label: this.i18n().hero_imgix_label(), placeholder: this.i18n().hero_imgix_placeholder(), helper: this.i18n().hero_imgix_helper(),
  }));
  protected readonly widthI18n = computed<TextInputI18n>(() => ({
    name: 'width', label: this.i18n().width_label(), placeholder: this.i18n().width_placeholder(), helper: this.i18n().width_helper(),
  }));
  protected readonly borderI18n = computed<TextInputI18n>(() => ({
    name: 'border', label: this.i18n().border_label(), placeholder: this.i18n().border_placeholder(), helper: this.i18n().border_helper(),
  }));
  protected readonly borderRadiusI18n = computed<TextInputI18n>(() => ({
    name: 'borderRadius', label: this.i18n().borderRadius_label(), placeholder: this.i18n().borderRadius_placeholder(), helper: this.i18n().borderRadius_helper(),
  }));
  protected readonly labelI18n = computed<TextInputI18n>(() => ({
    name: 'ctaLabel', label: this.i18n().cta_label_label(), placeholder: this.i18n().cta_label_placeholder(), helper: this.i18n().cta_label_helper(),
  }));
  protected readonly urlI18n = computed<TextInputI18n>(() => ({
    name: 'ctaUrl', label: this.i18n().cta_url_label(), placeholder: this.i18n().cta_url_placeholder(), helper: this.i18n().cta_url_helper(),
  }));

  /************************************** changes *********************************************** */
  private emit(next: HeroConfig): void {
    if (next !== this.config()) this.configChange.emit(next);
  }

  /** one image at most: a new upload replaces it, removing it leaves an empty image */
  protected setCover(images: ImageConfig[]): void {
    this.emit(applyHeroCover(this.config(), images[images.length - 1]));
  }

  protected setLogo(images: ImageConfig[]): void {
    this.emit(applyHeroLogo(this.config(), images[images.length - 1]));
  }

  protected setHeight(choice: HeroHeightChoice): void {
    if (choice !== this.height()) this.emit(applyHeroHeight(this.config(), choice));
  }

  protected setHeightPx(value: number): void {
    if (value !== this.config().height) this.emit({ ...this.config(), height: value });
  }

  protected setFocus(value: unknown): void {
    const focus = HERO_FOCUSES.find((f) => f === value);
    if (focus && focus !== this.config().focus) this.emit({ ...this.config(), focus });
  }

  protected setGradient(field: keyof HeroGradient, value: string): void {
    this.emit({ ...this.config(), gradient: { ...this.gradient(), [field]: value } });
  }

  protected setStyle(field: 'imgIxParams' | 'width' | 'border' | 'borderRadius', value: string): void {
    if (value !== this.style()[field]) this.emit({ ...this.config(), imageStyle: { ...this.style(), [field]: value } });
  }

  protected setLogoSize(value: unknown): void {
    const size = HERO_LOGO_SIZES.find((s) => s === value);
    if (size && size !== this.logoSize()) this.emit(applyHeroLogoSize(this.config(), size));
  }

  protected setLogoShape(value: unknown): void {
    const shape = HERO_LOGO_SHAPES.find((s) => s === value);
    if (shape && shape !== this.logoShape()) this.emit(applyHeroLogoShape(this.config(), shape));
  }

  protected setCta(patch: Partial<SectionCta>): void {
    this.emit(updateHeroCta(this.config(), this.buttonIndex(), patch));
  }

  protected removeCta(): void {
    this.emit(removeHeroCta(this.config(), this.buttonIndex()));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
