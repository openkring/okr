import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { ENV } from '@okr/shared-config';
import { ArticleSlideshow, ImageConfig } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ImgDirective } from '@okr/shared-ui';
import { ArticlePreviewDevice, previewViewport, slideshowImageUrl, slideshowStep } from '@okr/cms-section-util';

/**
 * The images of an article as a self-running slideshow (fade, slide, zoom, Ken Burns), with the
 * article's title and subtitle on top — the header of la21staefa.ch. All slides are stacked; only
 * classes change, the transition itself is CSS. Autoplay stops for `prefers-reduced-motion`.
 */
@Component({
  selector: 'okr-article-slideshow',
  standalone: true,
  imports: [ImgDirective, IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host { display: block; }
    .show { position: relative; overflow: hidden; width: 100%; aspect-ratio: 8 / 3; min-height: 240px; max-height: 60dvh; border-radius: 12px; background: #000; }
    .slide { position: absolute; inset: 0; opacity: 0; transition-property: opacity, transform; transition-timing-function: ease-in-out; transition-duration: var(--dur); }
    .slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .slide.active { opacity: 1; z-index: 1; }
    /* slide: the old image leaves to the left, the new one comes in from the right */
    .fx-slide .slide { opacity: 1; transform: translateX(100%); }
    .fx-slide .slide.leaving { transform: translateX(-100%); }
    .fx-slide .slide.active { transform: translateX(0); }
    .fx-slide .slide:not(.active):not(.leaving) { transition: none; }
    /* zoom: the new image fades in while settling from 110 % to 100 % */
    .fx-zoom .slide { transform: scale(1.1); }
    .fx-zoom .slide.active { transform: scale(1); }
    /* Ken Burns: a slow drift on the visible image, through its whole stay */
    .fx-kenburns .slide.active img { animation: kenburns var(--stay) linear forwards; }
    .show.paused .slide img { animation: none; }
    @keyframes kenburns { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.12) translate(-2%, -1%); } }
    .overlay { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; padding: 24px 32px; color: #fff;
      background: linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.5) 100%); pointer-events: none; }
    .overlay h1 { margin: 0 0 8px 0; font-size: clamp(1.5rem, 4vw, 2.6rem); font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.4); }
    .overlay p { margin: 0; max-width: 46rem; font-size: clamp(1rem, 1.8vw, 1.25rem); text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; --border-radius: 50%; --padding-start: 0; --padding-end: 0; width: 40px; height: 40px; opacity: 0.8; }
    .nav.prev { left: 0.75rem; } .nav.next { right: 0.75rem; }
    .dots { position: absolute; bottom: 10px; left: 0; right: 0; z-index: 3; display: flex; justify-content: center; gap: 8px; }
    .dots button { width: 10px; height: 10px; padding: 0; border-radius: 50%; border: 1px solid rgba(255,255,255,0.8); background: rgba(255,255,255,0.35); cursor: pointer; }
    .dots button.on { background: #fff; }
    @media (prefers-reduced-motion: reduce) { .slide, .slide img { transition: none !important; animation: none !important; } }
  `],
  template: `
    <div class="show" [class]="'fx-' + settings().effect" [class.paused]="paused()" [style.max-height]="sizes()?.maxHeight" [style.--dur]="settings().duration + 's'"
      [style.--stay]="(settings().interval + settings().duration) + 's'"
      (mouseenter)="hovered.set(true)" (mouseleave)="hovered.set(false)">
      @for (src of sources(); track $index) {
        <div class="slide" [class.active]="$index === current()" [class.leaving]="$index === previous()">
          @if (src) { <img okrImg [src]="src" [alt]="images()[$index].altText || ''" [attr.loading]="$index === 0 ? 'eager' : 'lazy'" /> }
        </div>
      }
      @if (title() || subTitle()) {
        <div class="overlay">
          @if (title()) { <h1 [style.font-size]="sizes()?.title">{{ title() }}</h1> }
          @if (subTitle()) { <p [style.font-size]="sizes()?.subTitle">{{ subTitle() }}</p> }
        </div>
      }
      <ion-button class="nav prev" fill="solid" color="light" (click)="onNav(-1)" aria-label="Previous image">
        <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
      </ion-button>
      <ion-button class="nav next" fill="solid" color="light" (click)="onNav(1)" aria-label="Next image">
        <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
      </ion-button>
      <div class="dots">
        @for (src of sources(); track $index) {
          <button type="button" [class.on]="$index === current()" (click)="onDot($index)" [attr.aria-label]="'Image ' + ($index + 1)"></button>
        }
      </div>
    </div>
  `,
})
export class ArticleSlideshowComponent {
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;

  public readonly images = input.required<ImageConfig[]>();
  public readonly settings = input.required<ArticleSlideshow>();
  public readonly title = input('');
  public readonly subTitle = input('');
  public readonly previewDevice = input<ArticlePreviewDevice>('auto');
  /** stands still: it does not advance, and Ken Burns does not run */
  public readonly paused = input(false);
  /** arrows and dots do nothing */
  public readonly inert = input(false);

  protected readonly sources = computed(() => this.images().map(i => slideshowImageUrl(i.url, this.imgixBaseUrl)));
  protected readonly current = signal(0);
  /** the image that is just leaving (effect 'slide' moves it out to the left); -1 = none */
  protected readonly previous = signal(-1);
  protected readonly hovered = signal(false);
  /** what the styles take from the viewport, for a previewed device */
  protected readonly sizes = computed(() => {
    const viewport = previewViewport(this.previewDevice());
    return viewport && {
      maxHeight: `${viewport.height * 0.6}px`,
      title: `clamp(1.5rem, ${viewport.width * 0.04}px, 2.6rem)`,
      subTitle: `clamp(1rem, ${viewport.width * 0.018}px, 1.25rem)`,
    };
  });

  private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // (re)start the timer whenever the settings, the image count or the pause state change
    effect(() => {
      const { autoplay, interval } = this.settings();
      const count = this.sources().length;
      const paused = this.paused() || this.hovered();
      clearInterval(this.timer);
      if (autoplay && !paused && !this.reducedMotion && count > 1) {
        this.timer = setInterval(() => this.go(1), interval * 1000);
      }
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected onNav(direction: 1 | -1): void {
    if (!this.inert()) this.go(direction);
  }

  protected onDot(index: number): void {
    if (!this.inert()) this.show(index);
  }

  protected go(direction: 1 | -1): void {
    this.show(slideshowStep(this.current(), direction, this.sources().length));
  }

  protected show(index: number): void {
    if (index === this.current()) return;
    this.previous.set(this.current());
    this.current.set(index);
  }
}
