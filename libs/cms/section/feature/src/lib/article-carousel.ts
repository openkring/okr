import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, viewChild } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { ImageConfig, ImageStyle } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { badgeFor, Img } from '@okr/shared-ui';

/** The swipe carousel of several article images: one box per image, endless in both directions. */
@Component({
  selector: 'okr-article-carousel',
  standalone: true,
  imports: [Img, SvgIconPipe, IonButton, IonIcon],
  schemas: [
    CUSTOM_ELEMENTS_SCHEMA
  ],
  styles: [`
    :host { display: block; }
    .carousel-container { position: relative; margin: 0.5rem 0; }
    .carousel {
      display: flex;
      gap: 1rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      border-radius: 12px;
      scrollbar-width: none;
      scroll-marker-group: after;
    }
    .carousel::scroll-marker-group {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      padding-top: 1rem;
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
    }
    /* every slide is the same box (full width, at most half the viewport high); portrait and landscape
       images are fitted into it whole, at their own proportions (object-fit: contain, never cropped) */
    .carousel-slide {
      flex: 0 0 100%;
      height: 50dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      scroll-snap-align: center;
      container-type: scroll-state;
      container-name: slide;
    }
    .carousel-slide okr-img { display: block; width: 100%; }
    .carousel-slide::scroll-marker {
      content: "";
      width: 12px; height: 12px;
      background: #d1d5db;
      border: 1px solid #9ca3af;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    /* the two loop copies (last image before the first, first image after the last) get no dot */
    .carousel-slide.clone::scroll-marker { content: none; }
    .carousel-slide::scroll-marker:hover { background: #9ca3af; }
    .carousel-slide::scroll-marker:target-current { background: #3b82f6; transform: scale(1.3); border: 1px solid black; }
    /* prev / next: real buttons (the native ::scroll-button stops at both ends and is Chrome-only);
       the carousel loops endlessly in the direction of travel (see step / settleLoop) */
    .carousel-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10;
      --border-radius: 50%;
      --padding-start: 0;
      --padding-end: 0;
      width: 40px;
      height: 40px;
    }
    .carousel-nav.prev { left: 0.75rem; }
    .carousel-nav.next { right: 0.75rem; }
  `],
  template: `
    <div class="carousel-container">
      <div class="carousel" #carousel (scroll)="onCarouselScroll()">
        @for(slide of loopSlides(); track $index) {
          <div class="carousel-slide" [class.clone]="slide.clone" [attr.aria-hidden]="slide.clone ? 'true' : null">
            <okr-img [captionFallbacks]="captionFallbacks()" [image]="slide.image" [imageStyle]="carouselImageStyle()" [editMode]="editMode()" [gallery]="images()" [zoomTitle]="zoomTitle()" [badge]="badgeOf(slide.image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
          </div>
        }
      </div>
      <ion-button class="carousel-nav prev" fill="solid" color="light" (click)="step(-1)" aria-label="Previous image">
        <ion-icon slot="icon-only" src="{{ 'chevron-back' | svgIcon }}" />
      </ion-button>
      <ion-button class="carousel-nav next" fill="solid" color="light" (click)="step(1)" aria-label="Next image">
        <ion-icon slot="icon-only" src="{{ 'chevron-forward' | svgIcon }}" />
      </ion-button>
    </div>
  `
})
export class ArticleCarousel {
  // inputs
  public images = input.required<ImageConfig[]>();
  public imageStyle = input.required<ImageStyle>();
  public captionFallbacks = input<string[]>([]);
  public editMode = input<boolean>(false);
  /** small text per image, keyed by ImageConfig.label */
  public imageBadges = input<Record<string, string>>({});
  /** hand a tap on an image to the host (imageSelected) instead of running the image style's action */
  public emitImageClicks = input(false);
  public zoomTitle = input<string>('Zoom');
  public imageSelected = output<ImageConfig>();

  protected badgeOf(label: string): string | undefined { return badgeFor(this.imageBadges(), label); }

  // the carousel: one fixed box for all slides; the image is shown whole at its own proportions
  // (no fill/crop, no pixel ar= crop), letterboxed inside the box. No border: it would frame the
  // letterbox rather than the image.
  protected carouselImageStyle = computed((): ImageStyle => ({
    ...this.imageStyle(),
    width: '100%',
    height: '50dvh',
    fill: false,
    border: '',
    borderRadius: '',
  }));

  // Endless carousel: a copy of the last image sits before the first, a copy of the first after the
  // last. Going forward from the last image scrolls on to the copy of the first (always the same
  // direction); once the scroll settles, the carousel jumps without animation to the real first image,
  // which looks identical. The same happens backwards, and when swiping.
  protected loopSlides = computed((): { image: ImageConfig; clone: boolean }[] => {
    const images = this.images();
    if (images.length < 2) return images.map(image => ({ image, clone: false }));
    return [
      { image: images[images.length - 1], clone: true },
      ...images.map(image => ({ image, clone: false })),
      { image: images[0], clone: true },
    ];
  });

  private carousel = viewChild<ElementRef<HTMLElement>>('carousel');
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  /** scrolls the carousel one slide back (-1) or forward (1), endlessly in that direction */
  protected step(direction: -1 | 1): void {
    const el = this.carousel()?.nativeElement;
    if (!el) return;
    const count = el.children.length;
    if (count < 3) return;
    let current = this.currentSlide(el);
    // standing on a copy (e.g. a quick second click): first move to the real image it shows
    if (current === count - 1) current = this.jumpTo(el, 1);
    else if (current === 0) current = this.jumpTo(el, count - 2);
    this.scrollToSlide(el, current + direction, 'smooth');
  }

  /** after every scroll (button or swipe) has come to rest, leave a copy for the real image */
  protected onCarouselScroll(): void {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settleLoop(), 150);
  }

  private settleLoop(): void {
    const el = this.carousel()?.nativeElement;
    if (!el) return;
    const count = el.children.length;
    if (count < 3) return;
    const current = this.currentSlide(el);
    if (current === count - 1) this.jumpTo(el, 1);
    else if (current === 0) this.jumpTo(el, count - 2);
  }

  /** the slide whose left edge is nearest to the scroll position */
  private currentSlide(el: HTMLElement): number {
    const slides = Array.from(el.children) as HTMLElement[];
    return slides.reduce((best, slide, i) =>
      Math.abs(this.slideLeft(el, i) - el.scrollLeft) < Math.abs(this.slideLeft(el, best) - el.scrollLeft) ? i : best, 0);
  }

  private jumpTo(el: HTMLElement, index: number): number {
    this.scrollToSlide(el, index, 'instant');
    return index;
  }

  private scrollToSlide(el: HTMLElement, index: number, behavior: ScrollBehavior): void {
    el.scrollTo({ left: this.slideLeft(el, index), behavior });
  }

  private slideLeft(el: HTMLElement, index: number): number {
    const slide = el.children[index] as HTMLElement | undefined;
    return slide ? slide.offsetLeft - el.offsetLeft : 0;
  }

  constructor() {
    // start on the real first image (slide 1), not on the copy of the last one before it
    afterRenderEffect(() => {
      const el = this.carousel()?.nativeElement;
      if (el && this.loopSlides().length >= 3) this.jumpTo(el, 1);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.settleTimer));
  }
}
