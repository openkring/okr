import { IMAGE_LOADER, ImageLoaderConfig, NgOptimizedImage, NgStyle } from '@angular/common';
import { Component, computed, ElementRef, inject, input, resource, viewChild } from '@angular/core';
import { IonThumbnail, ModalController, ToastController } from '@ionic/angular';
import { Browser } from '@capacitor/browser';

import { ENV } from '@okr/shared-config';
import { ImageActionType, ImageConfig, ImageStyle } from '@okr/shared-models';
import { appendImgixParams, buildImageCaption, getCaptionCss, getCaptionLuminanceUrl, getCaptionTone, getImageFrameCss, getImgixUrl, getSizedImgixParamsByExtension, getThumbnailUrl, isDirectImageUrl, toCssLength, toPixelNumber } from '@okr/shared-util-core';
import { downloadToBrowser } from '@okr/shared-util-angular';

import { findImageIndex, showImageSlider, showZoomedImage } from './ui.util';

/**
 * This image loading implementation is based on Angular's NgOptimizedImage together with Imgix CDN to provide optimized images.
 * see: https://angular.dev/tutorials/learn-angular/11-optimizing-images
 *      https://angular.dev/guide/image-optimization 
 *      https://www.smashingmagazine.com/2020/03/setting-height-width-images-important-again/
 * 
 * NgOptimizedImage supports the following image loading features:
 * - prevent layout shift (CLS) by reserving space for images (that's why we need width and height)
 * - image can fill its containing element like a background image (fill); Parent element must be styled with 
 *   position: relative, position: fixed, or position: absolute
 * - the LCP element (largest contentful paint, i.e the largest on-screen graphical element when the page loads) 
 *   can be defined with attribute 'priority'. This sets priority hints fetchpriority="hight" and loading="eager"
 * - native lazy loading of images (loading="lazy") when no priority is given (see: https://addyosmani.com/blog/lazy-loading/)
 *   generally available in all browsers for img and iframe elements
 *   allows a browser to defer loading offscreen images (including srcset & picture) and iframes until the user scrolls near them
 * - image resolution switching: automatically generating srcset attribute for responsive images (based on the given sizes attribute)
 *   srcset can be manually configured with:  ngSrcset="100x, 200x, 300x"
 * - automatically generating preconnect link tag in the document head
 * - generating preload hint if app is using SSR
 * - Low-Quality Image Placeholders (LQIP): provides a placeholder image while the image is loading 
 *   (with CSS blur, with default size of 30px)
 * 
 * This component additionally supports the following features:
 * - automatically assigns the image's aspect ratio to the containing element (ar param in imgixUrl)
 * - provides a fallback image if the image fails to load
 * - automatically assigns sizes attribute to the image element with default values
 * - Art Direction with picture element (via imgix parameters)
 * - Alternative LQIP solution with imgix: blur=200&px=16&auto=format (see: https://www.imgix.com/blog/lqip-your-images)
 * - adding text overlays with imgix (~text parameter for multiline texts, base64 encoded)
 *   see: https://docs.imgix.com/tutorials/advanced/text-overlays)
 *        https://docs.imgix.com/getting-started/tutorials/design-elements-and-composition/multiline-text-and-overlays-with-the-typesetting-endpoint
 *   Text Endpoint Set as Blend: blend64=https://assets.imgix.net/~text?txt64=Far far away, txt-color=fff txt-font=avenir-black txt-size=48 w=600 txt-pad=20
 *
 * Recommendations: 
 * - use srcset with sizes attribute, which is more flexible and allows for more control over the image's display size (rather than DPR)
 * - The parameter combination auto=compress,format&cs=srgb will deliver compressed AVIF images for browsers that support it 
 *   (Chrome, Firefox, etc.) and fall back to the original format for other instances. More modern formats like AVIF can greatly 
 *   cut down the amount of image data sent to the client, sometimes by as much as 35%.
 * - Since srcsets retain the perceived quality of an image, it's safe to use auto=compress to further optimize your asset. 
 * - Add cs=srgb to prevent changes in color during compression.
 * 
 * Tbd: Metadata / EXIF-date with JSON format (fm=json):
see: https://docs.imgix.com/getting-started/tutorials/performance-and-metadata/extract-image-metadata-with-json-output-format
Text boxes are generated as (transparent) png image and loaded as watermark. 
See <a href="https://sandbox.imgix.com/view?url=https://assets.imgix.net/~text?fm%3Dpng%26txt-size%3D36%26w%3D600%26txt-font%3DAvenir%2BNext%2BCondensed%2CBold%26txt%3DThe%2Bquick%2Bbrown%2Bfox%2Bjumps%2Bover%2Bthe%2Blazy%2Bdog.%2BThe%2Bfive%2Bboxing%2Bwizards%2Bjump%2Bquickly.%26txt-pad%3D30%26bg%3D3D4C5F%26txt-color%3Dfff&_gl=1*17rwjsw*_gcl_au*OTQyNjY2MDEuMTcwOTE1MzgwNA..">sandbox</a> for examples.
 * txt, text, txt-align, txt-font, txt-color
 */

@Component({
  selector: 'okr-img',
  standalone: true,
  imports: [
    NgOptimizedImage, NgStyle,
    IonThumbnail
  ],
  providers: [
    {
      provide: IMAGE_LOADER,
      // ngSrc already contains the full imgix URL with params (e.g. ?ar=...&auto=format).
      // This loader appends &w=<width> (or ?w=<width> if no params yet) for srcset generation.
      useValue: (config: ImageLoaderConfig) => {
        if (!config.width) return config.src;
        const separator = config.src.includes('?') ? '&' : '?';
        return `${config.src}${separator}w=${config.width}`;
      },
    }
  ],
  styles: [`
      ion-thumbnail { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative;}
      .image-container { position: relative; display: flex; justify-content: center; align-items: flex-start; width: 100%; height: auto; }
      .image-container img { object-fit: cover; }
      /* the caption is rendered as DOM (not baked into the imgix url) so that it is never
         cropped away by object-fit and stays legible at every srcset rendition. */
      .image-caption {
        line-height: 1.25;
        white-space: pre-line;
        pointer-events: none;
      }
      /* top / bottom: a plain text line above or below the image, in the page's text colour */
      .image-caption .caption-text,
      .image-caption .caption-source { display: block; }
      /* the Quelle as second line, 10 % smaller than the Untertitel */
      .image-caption .caption-source { font-size: 0.9em; }
      .image-caption.outside {
        padding: 4px 2px;
        color: var(--ion-color-medium-shade, #666);
      }
      /* top-overlay / bottom-overlay: laid over the image edge, white on a soft gradient */
      .image-caption.overlay {
        position: absolute;
        left: 0; right: 0;
        padding: 8px 12px;
        color: #fff;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      }
      .image-caption.overlay.bottom {
        bottom: 0;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
      }
      .image-caption.overlay.top {
        top: 0;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
      }
      /* middle-overlay: a band across the vertical centre */
      .image-caption.overlay.middle {
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.45);
      }
      /* the band under the caption was measured light (imgix palette): dark text on a light wash */
      .image-caption.overlay.light {
        color: #111;
        text-shadow: 0 1px 3px rgba(255, 255, 255, 0.8);
      }
      .image-caption.overlay.light.bottom { background: linear-gradient(to top, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0)); }
      .image-caption.overlay.light.top { background: linear-gradient(to bottom, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0)); }
      .image-caption.overlay.light.middle { background: rgba(255, 255, 255, 0.45); }
    `],
  template: `
      @if(image(); as image) {
        @if(url(); as url) {
        @if(isThumbnail() === true) {
          <ion-thumbnail [slot]="slot()" [ngStyle]="style()" (click)="onImageClicked()">
            @if(isLocalImage()) {
              <img [src]="url" [alt]="altText()" loading="lazy" />
            } @else {
              <img [ngSrc]="thumbnailUrl()" [alt]="altText()" />
            }
          </ion-thumbnail>
        }
        @else {
          @if(caption(); as caption) { @if(captionPosition() === 'top') {
            <div class="image-caption outside" [ngStyle]="captionStyles()"><span class="caption-text">{{ caption.text }}</span>@if(caption.source) {<span class="caption-source">{{ caption.source }}</span>}</div>
          } }
          <div class="image-container" [ngStyle]="containerStyles()">
            @if(isExternalImage()) {
              <img
                [src]="url"
                [attr.width]="numericWidth() ?? null"
                [attr.height]="numericHeight() ?? null"
                [alt]="altText()"
                [ngStyle]="imageStyles()"
                (click)="onImageClicked()"
              />
            }
            @else if(useFill()) {
              <img
                [ngSrc]="imgixUrl()"
                [ngSrcset]="srcset()"
                [sizes]="sizes()"
                [priority]="hasPriority()"
                fill
                [alt]="altText()"
                (click)="onImageClicked()"
              />
            }
            @else {
              <!-- the whole image at its own proportions: a plain img (NgOptimizedImage needs fixed
                   width/height attributes, which a '100%' / 'auto' style does not have), with the same
                   imgix srcset the loader would build -->
              <img
                [src]="imgixUrl()"
                [srcset]="plainSrcset()"
                [sizes]="sizes()"
                [attr.width]="numericWidth() ?? null"
                [attr.height]="numericHeight() ?? null"
                [attr.loading]="hasPriority() ? 'eager' : 'lazy'"
                [attr.fetchpriority]="hasPriority() ? 'high' : null"
                decoding="async"
                [alt]="altText()"
                [ngStyle]="imageStyles()"
                (click)="onImageClicked()"
              />
            }
            @if(caption(); as caption) {
              @if(captionPosition() === 'top-overlay') {
                <div class="image-caption overlay top" [class.light]="captionTone() === 'light'" [ngStyle]="captionStyles()"><span class="caption-text">{{ caption.text }}</span>@if(caption.source) {<span class="caption-source">{{ caption.source }}</span>}</div>
              } @else if(captionPosition() === 'middle-overlay') {
                <div class="image-caption overlay middle" [class.light]="captionTone() === 'light'" [ngStyle]="captionStyles()"><span class="caption-text">{{ caption.text }}</span>@if(caption.source) {<span class="caption-source">{{ caption.source }}</span>}</div>
              } @else if(captionPosition() === 'bottom-overlay') {
                <div class="image-caption overlay bottom" [class.light]="captionTone() === 'light'" [ngStyle]="captionStyles()"><span class="caption-text">{{ caption.text }}</span>@if(caption.source) {<span class="caption-source">{{ caption.source }}</span>}</div>
              }
            }
          </div>
          @if(caption(); as caption) { @if(captionPosition() === 'bottom') {
            <div class="image-caption outside" [ngStyle]="captionStyles()"><span class="caption-text">{{ caption.text }}</span>@if(caption.source) {<span class="caption-source">{{ caption.source }}</span>}</div>
          } }
        }
      }
    } 
    `
})
export class Img {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  protected readonly env = inject(ENV);

  // inputs
  public image = input.required<ImageConfig>();
  public imageStyle = input.required<ImageStyle>();
  public editMode = input<boolean>(false);
  public zoomTitle = input('Zoom');
  // Optional sibling images (e.g. the enclosing carousel/slider). When set, zooming this image
  // opens the full-screen viewer with prev/next navigation across the whole gallery.
  public gallery = input<ImageConfig[]>([]);
  /** caption texts used when the image has neither an Untertitel nor a Quelle, in order (e.g. section subtitle, title) */
  public captionFallbacks = input<(string | undefined)[]>([]);

  protected imageContainer = viewChild('.image-container', { read: ElementRef });

  // fields
  // by default, image is 100% of screen width on devices under 768px wide, and 50% on bigger screens
  // alternatively when excluding the menu: calc(100vw - 128px)
  protected url = computed(() => this.image().url ?? '');
  protected altText = computed(() => this.image().altText ?? 'Image');
  protected sizes = computed(() => this.imageStyle()?.sizes ?? '(max-width: 768px) 100vw, 50vw');
  protected isThumbnail = computed(() => this.imageStyle()?.isThumbnail ?? false);
  protected slot = computed(() => this.imageStyle()?.slot ?? 'start');
  protected fill = computed(() => this.imageStyle()?.fill ?? false);
  protected hasPriority = computed(() => this.imageStyle()?.hasPriority ?? false);
  protected actionType = computed(() => this.imageStyle()?.action ?? 'none');
  protected actionUrl = computed(() => this.image()?.actionUrl ?? '');
  // absolute http(s) and local files (capacitor://, file:, blob:, data:) are shown as is, never via imgix
  protected isExternalImage = computed(() => isDirectImageUrl(this.url()));
  // thumbnails keep their file-type icon and imgix sizing for http(s) — only local files (capacitor://, file:,
  // blob:, data:) are shown as they are
  protected isLocalImage = computed(() => isDirectImageUrl(this.url()) && !/^https?:/i.test(this.url()));
  protected srcset = computed(() => this.generateSrcset());
  // title/credit caption, rendered as an overlay element on top of the image
  // the caption (Untertitel): the image's own, else its Quelle, else the section's fallbacks;
  // undefined when it is switched off (captionPosition 'none', the default) or there is no text
  protected caption = computed(() => {
    if (this.captionPosition() === 'none') return undefined;
    const caption = buildImageCaption(this.image(), this.captionFallbacks());
    return caption.text ? caption : undefined;
  });
  // where and how the caption is shown; legacy styles without these fields get the defaults
  protected captionPosition = computed(() => this.imageStyle()?.captionPosition ?? 'none');
  protected captionStyles = computed(() => getCaptionCss(this.imageStyle()));
  // overlay captions only: imgix measures the brightness of the band under the caption, so a light
  // band gets dark text. One small JSON request per captioned image (CDN-cached); while it loads or
  // when it fails the caption stays white on the dark gradient, which is readable on any image.
  private captionLuminanceUrl = computed(() => {
    if (!this.caption() || this.isExternalImage() || this.isThumbnail()) return undefined;
    return getCaptionLuminanceUrl(this.imgixUrl(), this.imageStyle());
  });
  private captionLuminance = resource({
    params: () => this.captionLuminanceUrl(),
    loader: async ({ params, abortSignal }): Promise<number | undefined> => {
      const response = await fetch(params, { signal: abortSignal });
      if (!response.ok) return undefined;
      const palette = await response.json() as { average_luminance?: unknown };
      return typeof palette.average_luminance === 'number' ? palette.average_luminance : undefined;
    },
  });
  protected captionTone = computed(() =>
    getCaptionTone(this.captionLuminance.hasValue() ? this.captionLuminance.value() : undefined));

  protected generateSrcset(): string {
    // ngSrcset must be width descriptors only; IMAGE_LOADER appends &w= to imgixUrl() (the ngSrc).
    return '320w, 640w, 960w, 1280w, 1920w';
  }

    // using imgix to generate srcset based on width and height
  protected style = computed(() => {
    return {
      '--size': this.imageStyle()?.width ?? '150px',
      '--border-radius': getImageFrameCss(this.imageStyle())['border-radius'] ?? '4px'
    };
  });
  protected width = computed(() => {
    const _width = this.imageStyle()?.width;
    return _width ?? this.getValue('width', 'auto');
  });
  protected height = computed(() => {
    const _height = this.imageStyle()?.height;
    return _height ?? this.getValue('height', 'auto');
  });

  // Convert width/height to numeric values for img attributes (only if they're pixel values)
  // BEWARE: CSS allows strings like '100%', '50vw', 'auto' for width and height,
  // but the img attributes require numeric values in pixels or nothing at all (auto)
  // ('100%' used to be parsed as 100 px, which drew the default image as a 100 × 600 strip)
  protected numericWidth = computed(() => toPixelNumber(this.width()));
  protected numericHeight = computed(() => toPixelNumber(this.height()));

  // styles for the img element: css sizes as given (100%, 50vw, auto, 300px …); a plain number is px.
  // max-width keeps a large pixel width inside its column; height auto keeps the image's own ratio.
  protected imageStyles = computed(() => {
    return {
      'display': 'block',
      'object-fit': 'contain',
      'width': toCssLength(this.width()) ?? '100%',
      'height': toCssLength(this.height()) ?? 'auto',
      'max-width': '100%',
      ...this.frame(),
    };
  });

  /** fill = a fixed, cropped box; it needs a real height, so with height 'auto' the whole image is shown instead */
  protected useFill = computed(() => {
    const h = this.height()?.trim();
    return this.fill() && !!h && h !== 'auto';
  });

  /** the imgix srcset NgOptimizedImage's loader would build, for the plain img */
  protected plainSrcset = computed(() => {
    const url = this.imgixUrl();
    if (!url) return '';
    const separator = url.includes('?') ? '&' : '?';
    return [320, 640, 960, 1280, 1920].map(w => `${url}${separator}w=${w} ${w}w`).join(', ');
  });

  // fill mode requires the container to have position:relative and an explicit height.
  // height may arrive as a plain number string (e.g. '329') or with a unit ('329px' / '50%').
  // Plain numbers are treated as px so that ngStyle emits a valid CSS value.
  protected containerStyles = computed(() => {
    if (!this.useFill()) return {};
    // in fill mode the img is absolutely positioned, so the frame goes on the container (clipped)
    const frame = { ...this.frame(), 'overflow': 'hidden', 'box-sizing': 'border-box' };
    return { 'height': toCssLength(this.height()) ?? '400px', ...frame };
  });

  /** border + corner radius from the image style (applied to the img, or to the container in fill mode) */
  protected frame = computed(() => getImageFrameCss(this.imageStyle()));

  // that was the original idea: we do not use the baseImgixUrl here, because it is already provided by the provideImgixLoader for NgOptimizedImage
  // now we eplicitely add imgixBaseUrl
  protected imgixUrl = computed(() => {
    const params = getSizedImgixParamsByExtension(this.url(), this.width(), this.height());
    return appendImgixParams(this.toAbsoluteUrl(getImgixUrl(this.url(), params)), this.imageStyle()?.imgIxParams);
  });

  /** Prepend the imgix base URL to a storage path ('tenant/...'); other urls are already absolute. */
  private toAbsoluteUrl(url: string): string {
    return url.startsWith('tenant') ? this.env.services.imgixBaseUrl + '/' + url : url;
  }

  protected thumbnailUrl = computed(() => {
    return getThumbnailUrl(this.url(), this.width(), this.height());
  });

  protected async onImageClicked(): Promise<void> {
    if (this.editMode()) return;
    switch(this.actionType()) {
      case ImageActionType.Zoom: {
        // not openImageGallery(): this caller overrides the caption with its own zoomTitle input
        const gallery = this.gallery();
        await showZoomedImage(this.modalController, this.url(), this.zoomTitle(), this.imageStyle(),
          this.altText(), 'full-modal', gallery, findImageIndex(gallery, this.image()));
        break;
      }
      case ImageActionType.OpenSlider: {
        const gallery = this.gallery();
        const images = gallery.length > 0 ? gallery : [this.image()];
        await showImageSlider(this.modalController, images, this.imageStyle(), findImageIndex(images, this.image()));
        break;
      }
      case ImageActionType.FollowLink:
        await Browser.open({ url: this.actionUrl() });
        break;
      case ImageActionType.Download:
        await downloadToBrowser(this.toastController, this.toAbsoluteUrl(this.url()));
        break;
      case ImageActionType.OpenDirectory:
      case ImageActionType.None:
      default:
        // do nothing
        break;
    }
  }

  private getValue(key: string, defaultValue: string): string {
    const _el = this.imageContainer();
    if (_el) {
      const value = _el.nativeElement[key] ?? defaultValue;
      console.log(`Img.getValue -> element found: ${key} -> value: ${value}`);
      return value;
    }
    console.log(`Img.getValue -> element not found: ${key} -> using default value: ${defaultValue}`);
    return defaultValue;
  }
}
