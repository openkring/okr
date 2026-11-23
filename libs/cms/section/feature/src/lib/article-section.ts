import { NgTemplateOutlet } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, effect, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonRow } from '@ionic/angular';

import { ArticleSection, ImageConfig, ViewPosition, articleBlocksOf, isFreeArticle, withClassicFields } from '@okr/shared-models';
import { resolveImageStyle } from '@okr/shared-util-core';
import { ImageLayoutId, articleBackground, articleHasLightText, articleHeaderPlace, articleImagePosition, resolveImageLayout, resolveSlideshow, validCtas, getSectionIntro } from '@okr/cms-section-util';
import { badgeFor, Img, OptionalCardHeader, Spinner } from '@okr/shared-ui';

// lazy: only ever used inside @defer below. Any other use of it here would make it eager
import { ArticleBlocks } from './article-blocks';
import { ArticleCarousel } from './article-carousel';
import { ArticleImages } from './article-images';
import { ArticleSlideshowComponent } from './article-slideshow';
import { ArticleStore } from './article-section.store';
import { openSectionLink } from './section-link';

@Component({
  selector: 'okr-article-section',
  standalone: true,
  imports: [
    Spinner, Img, ArticleBlocks, ArticleCarousel, ArticleImages, ArticleSlideshowComponent, NgTemplateOutlet, OptionalCardHeader,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonButton
  ],
  schemas: [
    CUSTOM_ELEMENTS_SCHEMA
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card.banner { background: color-mix(in srgb, var(--ion-color-secondary) 12%, transparent); border-radius: 8px; padding: 12px; }
    /* an own background colour (ArticleConfig.background): a solid band; text inherits the chosen colour */
    ion-card.colored { --background: var(--article-bg); background: var(--article-bg); --color: var(--article-fg); color: var(--article-fg); border-radius: 8px; padding: 12px; }
    ion-card.colored ::ng-deep ion-card-title, ion-card.colored ::ng-deep ion-card-subtitle { --color: inherit; color: inherit; }
    ion-card.colored ::ng-deep ion-item { --background: transparent; --color: inherit; color: inherit; }
    ion-card.colored ::ng-deep a { color: inherit; }
    ion-card.colored ion-row { align-items: center; }
    ion-card.colored { --article-columns-align: center; }
    .header-col okr-optional-card-header ::ng-deep ion-card-subtitle { font-size: 1.25rem; font-weight: 600; text-transform: none; }
    .cta { padding: 8px 5px 0px 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
  `],
  providers: [ArticleStore],
  template: `
    @if(section()) {
      <ng-template #carouselTpl>
        @if (slideshow(); as settings) {
          <okr-article-slideshow [images]="images()" [settings]="settings" [title]="title()" [subTitle]="subTitle()" />
        } @else {
        <okr-article-carousel [images]="images()" [imageStyle]="imageStyle()" [captionFallbacks]="captionFallbacks()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" [zoomTitle]="store.i18n.article_zoomed()" (imageSelected)="imageSelected.emit($event)" />
        }
      </ng-template>
      <ion-card [class.banner]="isBanner() && !background()" [class.colored]="!!background()"
                [style.--article-bg]="background() || null" [style.--article-fg]="background() ? (lightText() ? '#ffffff' : '#1e293b') : null">
        <!-- a slideshow carries the title and subtitle on its images, like the header of la21staefa.ch -->
        @if (!headerInColumn()) {
          <okr-optional-card-header [intro]="sectionIntro().text" [introPosition]="sectionIntro().position" [title]="titleOnImages() ? '' : title()" [subTitle]="titleOnImages() ? '' : subTitle()" />
        }
        <ion-card-content>
          @if (freeBlocks(); as blocks) {
            <!-- a free article (spec 1.173): its blocks carry everything, the button included -->
            @defer (on immediate) {
              <okr-article-blocks [blocks]="blocks" [title]="title()" [subTitle]="subTitle()" [intro]="sectionIntro()" [headerPlace]="headerPlace()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
            }
          } @else if (images().length > 0 || (content() && content()!.length > 7)) {
            @switch(position()) {
              @case(VP.Left) {
                <ion-grid>
                  <ion-row>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" [zoomTitle]="store.i18n.article_zoomed()" [badge]="badgeOf(image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
                      </ion-col>
                    }
                    <ion-col size="12" [sizeMd]="colSizeText()" [class.header-col]="headerInColumn()">
                      @if (headerInColumn()) {
                        <okr-optional-card-header [intro]="sectionIntro().text" [introPosition]="sectionIntro().position" [title]="title()" [subTitle]="subTitle()" />
                      }
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
                    <ion-col size="12" [sizeMd]="colSizeText()" [class.header-col]="headerInColumn()">
                      @if (headerInColumn()) {
                        <okr-optional-card-header [intro]="sectionIntro().text" [introPosition]="sectionIntro().position" [title]="title()" [subTitle]="subTitle()" />
                      }
                      <ion-item lines="none" class="ion-no-padding">
                        <div [innerHTML]="content()"></div>
                      </ion-item>
                    </ion-col>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" [badge]="badgeOf(image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>
              }
              @case(VP.Top) {
                <ion-grid>
                  @if(imageGridLayout(); as layout) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-article-images [images]="images()" [imageStyle]="imageStyle()" [layout]="layout" [editMode]="editMode()" [captionFallbacks]="captionFallbacks()" [zoomTitle]="store.i18n.article_zoomed()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
                      </ion-col>
                    </ion-row>
                  } @else if(images().length > 1) {
                    <ion-row>
                      <ion-col size="12">
                        <ng-container [ngTemplateOutlet]="carouselTpl" />
                      </ion-col>
                    </ion-row>
                  } @else if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" [badge]="badgeOf(image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
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
                  @if(imageGridLayout(); as layout) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-article-images [images]="images()" [imageStyle]="imageStyle()" [layout]="layout" [editMode]="editMode()" [captionFallbacks]="captionFallbacks()" [zoomTitle]="store.i18n.article_zoomed()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
                      </ion-col>
                    </ion-row>
                  } @else if(images().length > 1) {
                    <ion-row>
                      <ion-col size="12">
                        <ng-container [ngTemplateOutlet]="carouselTpl" />
                      </ion-col>
                    </ion-row>
                  } @else if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <okr-img [captionFallbacks]="captionFallbacks()" [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" [badge]="badgeOf(image.label)" [emitClicks]="emitImageClicks()" (clicked)="imageSelected.emit($event)" />
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
  // the stored section; everything below reads section(), its classic form
  // eslint-disable-next-line @angular-eslint/no-input-rename
  public rawSection = input<ArticleSection>(undefined, { alias: 'section' });
  public editMode = input<boolean>(false);
  /** small text per image, keyed by ImageConfig.label (travel journal: «❤ 2 · 💬 1») */
  public imageBadges = input<Record<string, string>>({});
  /** hand a tap on an image to the host (imageSelected) instead of running the image style's action */
  public emitImageClicks = input(false);
  public imageSelected = output<ImageConfig>();

  // computed
  /** the section with its old fields filled from its blocks; the same object for an article without blocks (spec 1.173) */
  protected section = computed(() => withClassicFields(this.rawSection()));
  /** the blocks of a free article, which the old fields cannot express; undefined = classic, drawn by the template below */
  protected freeBlocks = computed(() => isFreeArticle(this.rawSection()) ? articleBlocksOf(this.rawSection()) : undefined);
  protected badgeOf(label: string): string | undefined { return badgeFor(this.imageBadges(), label); }
  protected images = computed((): ImageConfig[] => this.store.images());
  // Single image (only when exactly 1 image is configured)
  protected image = computed(() => this.store.image());

  // several images: top (the carousel or the layout), or bottom when a layout is set; see articleImagePosition
  protected position = computed((): ViewPosition =>
    articleImagePosition(this.section()?.content?.position, this.images().length, this.section()?.properties.imageLayout));

  // the layout of several images, resolved for the current count; undefined for the carousel (no layout, or
  // slider) and for fewer than two images (except side-by-side), so existing articles keep today's template branches
  protected imageGridLayout = computed((): ImageLayoutId | undefined => {
    const layout = resolveImageLayout(this.section()?.properties.imageLayout, this.images().length);
    return layout && layout !== 'slider' ? layout : undefined;
  });

  /** the self-running slideshow instead of the swipe carousel; undefined = carousel (spec: la21staefa header) */
  protected slideshow = computed(() =>
    this.imageGridLayout() ? undefined : resolveSlideshow(this.section()?.properties.slideshow, this.images().length));

  /** the stored partial over the defaults (spec 1.171 D1b) */
  protected imageStyle = computed(() => resolveImageStyle(this.section()?.properties.imageStyle));
  // Shared texts (e.g. the privacy statement, one set of sections for every tenant) name the
  // tenant through placeholders such as @APPNAME@ and @DOMAIN@, like the title does.
  protected content = computed(() => this.store.appStore.replacePlaceholders(this.section()?.content?.htmlContent ?? '<p></p>'));
  protected sectionIntro = computed(() => {
    const intro = getSectionIntro(this.section());
    return { ...intro, text: this.store.appStore.replacePlaceholders(intro.text) };
  });
  protected isBanner = computed(() => this.section()?.properties.emphasis === 'banner');
  /** the article's own background colour ('' = none) and whether its text is white */
  protected background = computed(() => articleBackground(this.section()?.properties));
  protected lightText = computed(() => articleHasLightText(this.section()?.properties));
  /** a coloured article with one image beside the text carries its heading in the text column (the KISS block) */
  protected headerInColumn = computed(() => this.freeBlocks() ? this.headerPlace() === 'column' : !!this.background() && this.images().length === 1
    && (this.position() === ViewPosition.Left || this.position() === ViewPosition.Right));
  /** a free article: where its header is drawn */
  protected headerPlace = computed(() => articleHeaderPlace(this.freeBlocks(), !!this.background()));
  /** a slideshow carries title and subtitle on its images */
  protected titleOnImages = computed(() => this.freeBlocks() ? this.headerPlace() === 'slideshow' : !!this.slideshow());
  protected cta = computed(() => {
    if (this.freeBlocks()) return undefined;   // its buttons are blocks
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

  protected open(url: string): void {
    openSectionLink(this.router, url);
  }

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }
}
