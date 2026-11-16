import { NgStyle } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonChip, IonCol, IonGrid, IonIcon, IonLabel, IonRow } from '@ionic/angular';

import { HERO_OVERLAY_DEFAULT, HeroSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getSectionIntro, heroBackgroundStyle, heroHeightCss, heroImgixParams, heroLogoStyle, heroObjectPosition, heroOverlayCss, HeroOverlayText, validCtas } from '@okr/cms-section-util';
import { Img, Spinner } from '@okr/shared-ui';

import { openSectionLink } from './section-link';

@Component({
  selector: 'okr-hero-section',
  standalone: true,
  imports: [
    NgStyle, Spinner, Img, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonChip, IonLabel, IonIcon, IonButton
  ],
  styles: [`
    /* anchored to its own container (it used to position against the page) and bounded in height, so
       it also works as a story cover (travel journal, spec 1.113) — no hero section existed before */
    .hero-container { position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; min-height: min(700px, 60vh); }
    .hero-image { position: absolute; inset: 0; display: block; padding: 0; z-index: 1; }
    :host ::ng-deep .hero-image .image-container,
    :host ::ng-deep .hero-image img { width: 100% !important; height: 100% !important; object-fit: cover !important; object-position: var(--hero-focus, 50% 50%) !important; opacity: 0.85; }
    /* the journal's text over the cover photo: one layer over the image (gradient + aligned text) */
    .hero-overlay { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; padding: 16px 20px; box-sizing: border-box; }
    .overlay-title { font-size: 1em; font-weight: 700; line-height: 1.2; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45); }
    .overlay-subtitle { font-size: 0.55em; margin-top: 4px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45); }
    .overlay-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; font-size: 0.5em; }
    .overlay-chips ion-chip { color: inherit; border: 1px solid currentColor; background: transparent; }
    .hero-form {background-color: rgba(255, 255, 255); padding: 20px; border-radius: 10px; width: 600px; max-width: 600px; width: 90%; text-align: center; z-index: 5;}
    .intro-above { text-align: center; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .intro-below { text-align: center; font-size: 1rem; opacity: 0.8; white-space: pre-line; }
    .ctas { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .title { text-align: center; font-size: 2rem;}
    .subtitle { text-align: center; font-size: 1.2rem;}
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
    .logo { max-width: 300px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; }
  `],
  template: `
    @if(section(); as section) {
      <div class="hero-container" [style.min-height]="heightCss()" [style.--hero-focus]="objectPosition()">
        <okr-img class="hero-image" [image]="heroImage()" [imageStyle]="heroImageStyle()" />
        @if (overlayView(); as view) {
          <div class="hero-overlay" [ngStyle]="view.css">
            @if (view.title) { <div class="overlay-title">{{ view.title }}</div> }
            @if (view.subtitle) { <div class="overlay-subtitle">{{ view.subtitle }}</div> }
            @if (view.chips.length > 0) {
              <div class="overlay-chips">
                @for (chip of view.chips; track $index) {
                  <ion-chip>
                    @if (chipIcon(); as icon) {
                      @if (icon.chip === chip) { <ion-icon src="{{ icon.name | svgIcon: icon.set }}" /> }
                    }
                    <ion-label>{{ chip }}</ion-label>
                  </ion-chip>
                }
              </div>
            }
          </div>
        } @else if (hasCard()) {
          <ion-grid class="hero-form">
            @if (hasLogo()) {
              <ion-row>
                <ion-col>
                  <okr-img class="logo" [image]="logoImage()" [imageStyle]="logoStyle()" />
                </ion-col>
              </ion-row>
            }
            @if (intro().text && intro().position === 'above') { <ion-row><ion-col><div class="intro-above">{{ intro().text }}</div></ion-col></ion-row> }
            @if (section.title) { <ion-row><ion-col><div class="title">{{ section.title }}</div></ion-col></ion-row> }
            @if (section.subTitle) { <ion-row><ion-col><div class="subtitle">{{ section.subTitle }}</div></ion-col></ion-row> }
            @if (intro().text && intro().position === 'below') { <ion-row><ion-col><div class="intro-below">{{ intro().text }}</div></ion-col></ion-row> }
            @if (chips().length > 0) {
              <ion-row>
                <ion-col class="chips">
                  @for (chip of chips(); track $index) {
                    <ion-chip>
                      @if (chipIcon(); as icon) {
                        @if (icon.chip === chip) { <ion-icon src="{{ icon.name | svgIcon: icon.set }}" /> }
                      }
                      <ion-label>{{ chip }}</ion-label>
                    </ion-chip>
                  }
                </ion-col>
              </ion-row>
            }
            @if (ctas().length > 0) {
              <ion-row>
                <ion-col class="ctas">
                  @for (cta of ctas(); track $index) {
                    <ion-button [color]="cta.style === 'secondary' ? 'secondary' : 'primary'" [fill]="cta.style === 'secondary' ? 'outline' : 'solid'" (click)="open(cta.url)">{{ cta.label }}</ion-button>
                  }
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      </div>
    } @else {
      <okr-spinner />
    }
  `
})
export class HeroSectionComponent {
  private readonly router = inject(Router);

  // inputs
  public section = input<HeroSection>();
  /** an icon in front of the chip with exactly this text (travel journal: the weather chip) */
  public chipIcon = input<{ chip: string; name: string; set: string } | undefined>();

  /** the journal's footprint lines; present = they are drawn over the image instead of the white card */
  public overlayText = input<HeroOverlayText | undefined>();

  // derived values
  protected heroImage = computed(() => this.section()?.properties.hero ?? IMAGE_CONFIG_SHAPE);
  // tbd on heroImage: hasPriority=true, ImageAction.None, isThumbnail=false, fill=true, altText='hero image'
  protected logoImage = computed(() => this.section()?.properties.logo ?? IMAGE_CONFIG_SHAPE);
  // tbd on logoImage: hasPriority=false, ImageAction.None, isThumbnail=false, fill=true, altText='logo image'
  /** the stored image style: its imgix parameters go to the cover, width, border and radius to the logo */
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
  protected logoStyle = computed(() => heroLogoStyle(this.imageStyle()));
  /** height and image focus only act when set; absent they leave today's rendering untouched */
  protected heightCss = computed(() => heroHeightCss(this.section()?.properties.height));
  protected objectPosition = computed(() => {
    const focus = this.section()?.properties.focus;
    return focus ? heroObjectPosition(focus) : null;
  });
  /**
   * The cover always fills the hero (no frame, caption or click action, loaded first); the imgix crop of the focus is
   * appended to the style's own parameters (the iPad's local file has no imgix)
   */
  protected heroImageStyle = computed(() => {
    const config = this.section()?.properties;
    return heroBackgroundStyle(this.imageStyle(), config ? heroImgixParams(config) : '');
  });
  /** an overlay config is only applied together with overlayText; the defaults only fill a journal cover without one */
  protected overlayView = computed(() => {
    const text = this.overlayText();
    if (!text) return undefined;
    const overlay = this.section()?.properties.overlay ?? HERO_OVERLAY_DEFAULT;
    const chips = [
      overlay.coords ? text.coords : '',
      overlay.weather ? text.weather : '',
      overlay.label.trim(),
    ].filter((chip) => !!chip);
    return {
      css: heroOverlayCss(overlay),
      title: overlay.title ? text.title : '',
      subtitle: overlay.subtitle ? text.subtitle : '',
      chips,
    };
  });
  /** above the title (the former «Überzeile») or below title and subtitle */
  protected intro = computed(() => getSectionIntro(this.section()));
  protected ctas = computed(() => validCtas(this.section()?.properties.ctas, 2));
  protected chips = computed(() => this.section()?.properties.chips ?? []);
  // The card shows only when it has something: a logo (the classic hero), a title, a subtitle or chips.
  protected hasLogo = computed(() => !!this.logoImage().url);
  protected hasCard = computed(() => {
    const section = this.section();
    return this.hasLogo() || !!this.intro().text || this.ctas().length > 0 || !!section?.title || !!section?.subTitle || this.chips().length > 0;
  });

  protected open(url: string): void {
    openSectionLink(this.router, url);
  }
}
