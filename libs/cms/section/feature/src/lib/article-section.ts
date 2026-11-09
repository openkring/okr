import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, computed, effect, inject, input, viewChild } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow } from '@ionic/angular';

import { ArticleSection, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, ViewPosition } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Img, OptionalCardHeader, Spinner } from '@okr/shared-ui';

import { ArticleStore } from './article-section.store';

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
    .carousel-slide::scroll-marker:hover { background: #9ca3af; }
    .carousel-slide::scroll-marker:target-current { background: #3b82f6; transform: scale(1.3); border: 1px solid black; }
    /* prev / next: real buttons (the native ::scroll-button stops at both ends and is Chrome-only);
       they loop, from the last slide to the first and back */
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
      <ion-card>
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
                          <div class="carousel" #carousel>
                            @for(img of images(); track img.url) {
                              <div class="carousel-slide">
                                <okr-img [captionFallbacks]="captionFallbacks()" [image]="img" [imageStyle]="carouselImageStyle()" [editMode]="editMode()" [gallery]="images()" [zoomTitle]="store.i18n.article_zoomed()" />
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
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class ArticleSectionComponent {
  protected store = inject(ArticleStore);

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
  protected colSizeImage = computed(() => this.section()?.content?.colSize ?? 6);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected title = computed(() => this.store.appStore.replacePlaceholders(this.section()?.title ?? ''));
  protected subTitle = computed(() => this.store.appStore.replacePlaceholders(this.section()?.subTitle ?? ''));
  // the image caption falls back to the section subtitle, then the section title
  protected captionFallbacks = computed(() => [this.subTitle(), this.title()]);

  public VP = ViewPosition;

  private carousel = viewChild<ElementRef<HTMLElement>>('carousel');

  /** scrolls the carousel one slide back (-1) or forward (1); loops at both ends */
  protected step(direction: -1 | 1): void {
    const el = this.carousel()?.nativeElement;
    if (!el) return;
    const slides = Array.from(el.children) as HTMLElement[];
    if (slides.length === 0) return;
    // the current slide is the one whose left edge is nearest to the scroll position
    const current = slides.reduce((best, slide, i) =>
      Math.abs(slide.offsetLeft - el.offsetLeft - el.scrollLeft) <
      Math.abs(slides[best].offsetLeft - el.offsetLeft - el.scrollLeft) ? i : best, 0);
    const target = (current + direction + slides.length) % slides.length;
    el.scrollTo({ left: slides[target].offsetLeft - el.offsetLeft });
  }

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }
}
