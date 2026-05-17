import { AfterViewInit, Component, ElementRef, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

import { IMAGE_STYLE_SHAPE, SliderSection } from '@bk2/shared-models';
import { ImageComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';


/**
 * We are building a slider with pure html and css.
 * Using scroll-button for the arrow navigation, scroll-state queries and scroll-markers.
 */
@Component({
  selector: 'bk-slider-section',
  standalone: true,
  imports: [
    SpinnerComponent, ImageComponent, OptionalCardHeaderComponent,
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

    /* bk-img is the host element — reachable from parent CSS unlike the img inside it.
       position: absolute + inset: 0 fills the slide reliably without a height: 100% chain. */
    .carousel-slide bk-img {
    position: absolute;
    inset: 0;
    display: block;
    transition: opacity 0.3s ease, scale 0.3s ease;
    opacity: 0.5;
    scale: 0.95;
    }

    @container slide scroll-state(snapped: x) {
    .carousel-slide bk-img {
        opacity: 1;
        scale: 1;
    }
    }

    /* SCROLL-MARKER: Create dot for each slide */
    .carousel-slide::scroll-marker {
    content: "";
    width: 15px;
    height: 15px;
    background: #d1d5db;
    border: 1px solid #9ca3af;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    }

    .carousel-slide::scroll-marker:hover {
    background: #9ca3af;
    }

    /* SCROLL-MARKER: Highlight active dot */
    .carousel-slide::scroll-marker:target-current {
    background: #3b82f6;
    transform: scale(1.3);
    border: 1px solid black;
    }

    /* SCROLL-BUTTON: Create arrow buttons */
    .carousel::scroll-button(*) {
    border: none;
    background: white;
    color: #374151;
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
    background: #3b82f6;
    color: white;
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
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content background="black">
            <div class="carousel-container">
                <div class="carousel" #carouselEl>
                    @for(image of images(); track image.url) {
                        <div class="carousel-slide">
                            <bk-img [image]="image" [imageStyle]="carouselImageStyle()" />
                        </div>
                    }
                </div>
            </div>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
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
