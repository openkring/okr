import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonChip, IonCol, IonGrid, IonIcon, IonLabel, IonRow } from '@ionic/angular';

import { HeroSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { validCtas } from '@okr/cms-section-util';
import { Img, Spinner } from '@okr/shared-ui';

import { openSectionLink } from './section-link';

@Component({
  selector: 'okr-hero-section',
  standalone: true,
  imports: [
    Spinner, Img, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonChip, IonLabel, IonIcon, IonButton
  ],
  styles: [`
    /* anchored to its own container (it used to position against the page) and bounded in height, so
       it also works as a story cover (travel journal, spec 1.113) — no hero section existed before */
    .hero-container { position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; min-height: min(700px, 60vh); }
    .hero-image { position: absolute; inset: 0; display: block; padding: 0; z-index: 1; }
    :host ::ng-deep .hero-image .image-container,
    :host ::ng-deep .hero-image img { width: 100% !important; height: 100% !important; object-fit: cover !important; opacity: 0.85; }
    .hero-form {background-color: rgba(255, 255, 255); padding: 20px; border-radius: 10px; width: 600px; max-width: 600px; width: 90%; text-align: center; z-index: 5;}
    .kicker { text-align: center; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .ctas { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .title { text-align: center; font-size: 2rem;}
    .subtitle { text-align: center; font-size: 1.2rem;}
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
    .logo { max-width: 300px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; }
  `],
  template: `
    @if(section(); as section) {
      <div class="hero-container">
        <okr-img class="hero-image" [image]="heroImage()" [imageStyle]="imageStyle()" />
        @if (hasCard()) {
          <ion-grid class="hero-form">
            @if (hasLogo()) {
              <ion-row>
                <ion-col>
                  <okr-img class="logo" [image]="logoImage()" [imageStyle]="imageStyle()" />
                </ion-col>
              </ion-row>
            }
            @if (kicker()) { <ion-row><ion-col><div class="kicker">{{ kicker() }}</div></ion-col></ion-row> }
            @if (section.title) { <ion-row><ion-col><div class="title">{{ section.title }}</div></ion-col></ion-row> }
            @if (section.subTitle) { <ion-row><ion-col><div class="subtitle">{{ section.subTitle }}</div></ion-col></ion-row> }
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

  // derived values
  protected heroImage = computed(() => this.section()?.properties.hero ?? IMAGE_CONFIG_SHAPE);
  // tbd on heroImage: hasPriority=true, ImageAction.None, isThumbnail=false, fill=true, altText='hero image'
  protected logoImage = computed(() => this.section()?.properties.logo ?? IMAGE_CONFIG_SHAPE);
  // tbd on logoImage: hasPriority=false, ImageAction.None, isThumbnail=false, fill=true, altText='logo image'
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
  protected kicker = computed(() => this.section()?.properties.kicker?.trim());
  protected ctas = computed(() => validCtas(this.section()?.properties.ctas, 2));
  protected chips = computed(() => this.section()?.properties.chips ?? []);
  // The card shows only when it has something: a logo (the classic hero), a title, a subtitle or chips.
  protected hasLogo = computed(() => !!this.logoImage().url);
  protected hasCard = computed(() => {
    const section = this.section();
    return this.hasLogo() || !!this.kicker() || this.ctas().length > 0 || !!section?.title || !!section?.subTitle || this.chips().length > 0;
  });

  protected open(url: string): void {
    openSectionLink(this.router, url);
  }
}
