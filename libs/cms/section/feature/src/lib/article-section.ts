import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow } from '@ionic/angular';

import { ArticleSection, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, ViewPosition } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { validCtas } from '@okr/cms-section-util';
import { Img, OptionalCardHeader, Spinner } from '@okr/shared-ui';

import { ArticleStore } from './article-section.store';
import { openSectionLink } from './section-link';

@Component({
  selector: 'okr-article-section',
  standalone: true,
  imports: [
    Spinner, Img, OptionalCardHeader, SvgIconPipe,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonButton, IonIcon
  ],
  schemas: [
    CUSTOM_ELEMENTS_SCHEMA
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card.banner { background: color-mix(in srgb, var(--ion-color-secondary) 12%, transparent); border-radius: 8px; padding: 12px; }
    .kicker { margin: 0px 0px 4px 0px; padding: 0px 5px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .cta { padding: 8px 5px 0px 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

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
  providers: [ArticleStore],
  template: `
    @if(section()) {
      <ion-card [class.banner]="isBanner()">
        @if (kicker()) { <p class="kicker">{{ kicker() }}</p> }
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (images().length > 0 || (content() && content()!.length > 7)) {
            @switch(position()) {
              @case(VP.Left) {
                <ion-grid>
                  <ion-row>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" [zoomTitle]="store.i18n.article_zoomed()" />
                      </ion-col>
                    }
                    <ion-col size="12" [sizeMd]="colSizeText()">
                      <ion-item lines="none" class="ion-no-padding">
                        <div [innerHTML]="content()"></div>
                      </ion-item>
                    </ion-col>
                  </ion-row>
                </ion-grid>
              }
              @case(VP.Right) {
                <ion-grid>
                  <ion-row>
                    <ion-col size="12" [sizeMd]="colSizeText()">
                      <ion-item lines="none" class="ion-no-padding">
                        <div [innerHTML]="content()"></div>
                      </ion-item>
                    </ion-col>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>
              }
              @case(VP.Top) {
                <ion-grid>
                  @if(images().length > 1) {
                    <ion-row>
                      <ion-col size="12">
                        <div class="carousel-container">
                          <div class="carousel" #carousel (scroll)="onCarouselScroll()">
                            @for(slide of loopSlides(); track $index) {
                              <div class="carousel-slide" [class.clone]="slide.clone" [attr.aria-hidden]="slide.clone ? 'true' : null">
                                <okr-img [captionFallbacks]="captionFallbacks()" [image]="slide.image" [imageStyle]="carouselImageStyle()" [editMode]="editMode()" [gallery]="images()" [zoomTitle]="store.i18n.article_zoomed()" />
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
                      </ion-col>
                    </ion-row>
                  } @else if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    </ion-row>
                  }
                  @if (content(); as content) {
                    @if(content.length > 7) {
                      <ion-row>
                        <ion-col size="12">
                          <ion-item lines="none" class="ion-no-padding">
                            <div [innerHTML]="content"></div>
                          </ion-item>
                        </ion-col>
                      </ion-row>
                    }
                  }
                </ion-grid>
              }
              @case(VP.Bottom) {
                <ion-grid>
                  @if (content(); as content) {
                    @if(content.length > 7) {
                      <ion-row>
                        <ion-col size="12">
                          <ion-item lines="none" class="ion-no-padding">
                            <div [innerHTML]="content"></div>
                          </ion-item>
                        </ion-col>
                      </ion-row>
                    }
                  }
                  @if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    </ion-row>
                  }
                </ion-grid>
              }
              @default {  <!-- VP.None: no image, content only -->
                <ion-item lines="none">
                  <div [innerHTML]="content()"></div>
                </ion-item>
              }
            }
          }
          @if (cta(); as cta) {
            <div class="cta">
              <ion-button [color]="cta.style === 'secondary' ? 'secondary' : 'primary'" [fill]="cta.style === 'secondary' ? 'outline' : 'solid'" (click)="open(cta.url)">{{ cta.label }}</ion-button>
            </div>
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class ArticleSectionComponent {
  protected store = inject(ArticleStore);
  private readonly router = inject(Router);

  // inputs
  public section = input<ArticleSection>();
  public editMode = input<boolean>(false);

  // computed
  protected images = computed((): ImageConfig[] => this.store.images());
  // Single image (only when exactly 1 image is configured)
  protected image = computed(() => this.store.image());

  protected position = computed((): ViewPosition => {
    const count = this.images().length;
    if (count === 0) return ViewPosition.None;
    if (count > 1) return ViewPosition.Top;
    return this.section()?.content?.position ?? ViewPosition.None;
  });

  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
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
  // Shared texts (e.g. the privacy statement, one set of sections for every tenant) name the
  // tenant through placeholders such as @APPNAME@ and @DOMAIN@, like the title does.
  protected content = computed(() => this.store.appStore.replacePlaceholders(this.section()?.content?.htmlContent ?? '<p></p>'));
  protected kicker = computed(() => this.store.appStore.replacePlaceholders(this.section()?.properties.kicker?.trim() ?? ''));
  protected isBanner = computed(() => this.section()?.properties.emphasis === 'banner');
  protected cta = computed(() => {
    const c = this.section()?.properties.cta;
    return c ? validCtas([c], 1)[0] : undefined;
  });
  protected colSizeImage = computed(() => this.section()?.content?.colSize ?? 6);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected title = computed(() => this.store.appStore.replacePlaceholders(this.section()?.title ?? ''));
  protected subTitle = computed(() => this.store.appStore.replacePlaceholders(this.section()?.subTitle ?? ''));
  // the image caption falls back to the section subtitle, then the section title
  protected captionFallbacks = computed(() => [this.subTitle(), this.title()]);

  public VP = ViewPosition;

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

  protected open(url: string): void {
    openSectionLink(this.router, url);
  }

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
    // start on the real first image (slide 1), not on the copy of the last one before it
    afterRenderEffect(() => {
      const el = this.carousel()?.nativeElement;
      if (el && this.loopSlides().length >= 3) this.jumpTo(el, 1);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.settleTimer));
  }
}
