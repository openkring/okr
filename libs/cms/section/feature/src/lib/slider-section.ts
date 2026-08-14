import { AfterViewInit, Component, ElementRef, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { IMAGE_STYLE_SHAPE, SliderSection } from '@okr/shared-models';
import { Img, OptionalCardHeader, Spinner } from '@okr/shared-ui';


/**
 * We are building a slider with pure html and css.
 * Using scroll-button for the arrow navigation, scroll-state queries and scroll-markers.
 */
@Component({
  selector: 'okr-slider-section',
  standalone: true,
  imports: [
    Spinner, Img, OptionalCardHeader,
    IonCard, IonCardContent
  ],
  styles: [`
    .carousel-container {
    position: relative;
    margin: 1.5rem 0;
    }

    .carousel {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    border-radius: 12px;
    scrollbar-width: none;

    /* SCROLL-MARKER-GROUP: Position dots below carousel */
    scroll-marker-group: after;
    }

    /* SCROLL-MARKER-GROUP: Style the dot container */
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

    .carousel-slide {
    position: relative;
    flex: 0 0 100%;
    scroll-snap-align: center;
    overflow: hidden;
    border-radius: 8px;
    aspect-ratio: 16 / 9;

    /* SCROLL-STATE: Enable snapped detection for this slide */
    container-type: scroll-state;
    container-name: slide;
    }

    /* okr-img is the host element — reachable from parent CSS unlike the img inside it.
       position: absolute + inset: 0 fills the slide reliably without a height: 100% chain. */
    .carousel-slide okr-img {
    position: absolute;
    inset: 0;
    display: block;
    transition: opacity 0.3s ease, scale 0.3s ease;
    opacity: 0.5;
    scale: 0.95;
    }

    @container slide scroll-state(snapped: x) {
    .carousel-slide okr-img {
        opacity: 1;
        scale: 1;
    }
    }

    /* SCROLL-MARKER: Create dot for each slide.
       Colours are Ionic theme variables, not literals: --ion-color-light and its -contrast
       flip with prefers-color-scheme (Ionic dark.system.css, refined per tenant in
       theme/variables.scss), and --ion-color-primary carries the tenant brand. A hardcoded
       grey/blue palette here rendered as white blocks on any dark surface. */
    .carousel-slide::scroll-marker {
    content: "";
    width: 15px;
    height: 15px;
    background: var(--ion-color-light);
    border: 1px solid var(--ion-color-medium);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    }

    .carousel-slide::scroll-marker:hover {
    background: var(--ion-color-medium);
    }

    /* SCROLL-MARKER: Highlight active dot */
    .carousel-slide::scroll-marker:target-current {
    background: var(--ion-color-primary);
    transform: scale(1.3);
    border: 1px solid var(--ion-color-primary-shade);
    }

    /* SCROLL-BUTTON: Create arrow buttons.
       --ion-color-light-contrast is the foreground Ionic pairs with --ion-color-light, so the
       glyph stays legible in both schemes (#000 on #f6f8fc light, #fff on #444343 dark)
       without needing its own media query. */
    .carousel::scroll-button(*) {
    border: none;
    background: var(--ion-color-light);
    color: var(--ion-color-light-contrast);
    font-size: 1.25rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    }

    .carousel::scroll-button(*):hover:not(:disabled) {
    background: var(--ion-color-primary);
    color: var(--ion-color-primary-contrast);
    }

    .carousel::scroll-button(*):disabled {
    opacity: 0.3;
    cursor: not-allowed;
    }

    .carousel::scroll-button(left) {
    content: "<";
    left: 1.5rem;
    }

    .carousel::scroll-button(right) {
    content: ">";
    right: 1.5rem;
    }

    /* FALLBACK for Safari / Firefox, which do not implement CSS Overflow 5
       (::scroll-button, ::scroll-marker, scroll-state()) as of 2026-08. There the
       carousel still swipes and snaps, but has no arrows and no dots — on desktop
       nothing signals that it scrolls. These elements restore both.
       They are gated in TypeScript (showFallbackNav), not by @supports, so the
       scroll listener behind the dots does not run at all on Chromium. Styles
       deliberately mirror ::scroll-button / ::scroll-marker above. */
    .carousel-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: var(--ion-color-light);
    color: var(--ion-color-light-contrast);
    font-size: 1.25rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.2s;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    }

    .carousel-nav:hover {
    background: var(--ion-color-primary);
    color: var(--ion-color-primary-contrast);
    }

    .carousel-nav.left { left: 1.5rem; }
    .carousel-nav.right { right: 1.5rem; }

    .carousel-dots {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    }

    .carousel-dots button {
    width: 15px;
    height: 15px;
    padding: 0;
    background: var(--ion-color-light);
    border: 1px solid var(--ion-color-medium);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    }

    .carousel-dots button:hover {
    background: var(--ion-color-medium);
    }

    .carousel-dots button.active {
    background: var(--ion-color-primary);
    transform: scale(1.3);
    border: 1px solid var(--ion-color-primary-shade);
    }
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <okr-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
            <div class="carousel-container">
                <div class="carousel" #carouselEl (scroll)="onScroll()">
                    @for(image of images(); track image.url) {
                        <div class="carousel-slide">
                            <okr-img [image]="image" [imageStyle]="carouselImageStyle()" [gallery]="images()" />
                        </div>
                    }
                </div>
                @if(showFallbackNav && images().length > 1) {
                    <button type="button" class="carousel-nav left"
                        [attr.aria-label]="store.i18n.slider_prev_image()" (click)="scrollByPage(-1)">&lsaquo;</button>
                    <button type="button" class="carousel-nav right"
                        [attr.aria-label]="store.i18n.slider_next_image()" (click)="scrollByPage(1)">&rsaquo;</button>
                    <div class="carousel-dots" role="tablist">
                        @for(image of images(); track image.url; let i = $index) {
                            <button type="button" role="tab"
                                [class.active]="i === activeIndex()"
                                [attr.aria-selected]="i === activeIndex()"
                                [attr.aria-label]="'Bild ' + (i + 1)"
                                (click)="scrollTo(i)"></button>
                        }
                    </div>
                }
            </div>
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class SliderSectionComponent implements AfterViewInit, OnDestroy {

  // inputs
  public section = input<SliderSection>();
  public editMode = input(false);

  private readonly carouselEl = viewChild<ElementRef>('carouselEl');
  private readonly containerWidth = signal(800); // fallback until measured
  private resizeObserver?: ResizeObserver;

  public ngAfterViewInit(): void {
    const el = this.carouselEl()?.nativeElement;
    if (!el) return;
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) this.containerWidth.set(w);
    });
    this.resizeObserver.observe(el);
  }

  // Fallback navigation for browsers without CSS Overflow 5 (Safari, Firefox).
  // Probing the property rather than the pseudo-elements: CSS.supports parses a
  // plain declaration reliably everywhere, selector(::scroll-button(*)) does not.
  // On the server CSS is undefined — the fallback renders, which is correct there
  // (client hydration is disabled, so the browser re-renders from scratch anyway).
  protected readonly showFallbackNav = typeof CSS === 'undefined' || !CSS.supports('scroll-marker-group', 'after');
  protected readonly activeIndex = signal(0);

  // Distance between two slides. Derived from the real scroll range instead of
  // clientWidth, because the 1rem flex gap makes each slide clientWidth + gap wide —
  // using clientWidth alone drifts by one gap per slide and lands on the wrong image.
  private slideStep(el: HTMLElement): number {
    const count = this.images().length;
    return count > 1 ? (el.scrollWidth - el.clientWidth) / (count - 1) : 0;
  }

  protected onScroll(): void {
    if (!this.showFallbackNav) return;
    const el = this.carouselEl()?.nativeElement as HTMLElement | undefined;
    if (!el) return;
    const step = this.slideStep(el);
    if (step > 0) this.activeIndex.set(Math.round(el.scrollLeft / step));
  }

  protected scrollByPage(direction: 1 | -1): void {
    const el = this.carouselEl()?.nativeElement as HTMLElement | undefined;
    if (el) el.scrollBy({ left: direction * this.slideStep(el), behavior: 'smooth' });
  }

  protected scrollTo(index: number): void {
    const el = this.carouselEl()?.nativeElement as HTMLElement | undefined;
    if (el) el.scrollTo({ left: index * this.slideStep(el), behavior: 'smooth' });
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  // derived signals
  protected images = computed(() => this.section()?.properties.images ?? []);
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  // Passes the measured container width to imgix for optimal srcset generation.
  // Height is intentionally '100%' — the visual height is controlled by the
  // CSS aspect-ratio: 16/9 on .carousel-slide, so the container shrinks/grows
  // responsively without any fixed pixel height.
  protected carouselImageStyle = computed(() => {
    const w = this.containerWidth();
    return {
      ...this.imageStyle(),
      width: String(w),
      height: '100%',
      fill: true,
      sizes: '100vw',
    };
  });
}
