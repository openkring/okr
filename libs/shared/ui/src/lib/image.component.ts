import { IMAGE_LOADER, ImageLoaderConfig, NgOptimizedImage, NgStyle } from '@angular/common';
import { Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { IonThumbnail, ModalController } from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';

import { ENV } from '@bk2/shared-config';
import { ImageActionType, ImageConfig, ImageStyle } from '@bk2/shared-models';
import { getImgixUrl, getSizedImgixParamsByExtension, getThumbnailUrl } from '@bk2/shared-util-core';
import { downloadToBrowser } from '@bk2/shared-util-angular';

import { showZoomedImage } from './ui.util';

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
  selector: 'bk-img',
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
    `],
  template: `
      @if(image(); as image) {
        @if(url(); as url) {
        @if(isThumbnail() === true) {
          <ion-thumbnail [slot]="slot()" [ngStyle]="style()" (click)="onImageClicked()">
            <img [ngSrc]="thumbnailUrl()" [alt]="altText()" /> 
          </ion-thumbnail>
        }
        @else {
          <div class="image-container" [ngStyle]="containerStyles()">
            @if(isExternalImage()) {
              <img
                [src]="url"
                [width]="numericWidth()"
                [height]="numericHeight()"
                [alt]="altText()"
                [ngStyle]="imageStyles()"
                (click)="onImageClicked()"
              />
            }
            @else if(fill()) {
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
              <img
                [ngSrc]="imgixUrl()"
                [ngSrcset]="srcset()"
                [width]="numericWidth() ?? 800"
                [height]="numericHeight() ?? 600"
                [sizes]="sizes()"
                [priority]="hasPriority()"
                [alt]="altText()"
                (click)="onImageClicked()"
              />
            }
          </div>
        }
      }
    } 
    `
})
export class ImageComponent {
  private readonly modalController = inject(ModalController);
  protected readonly env = inject(ENV);

  // inputs
  public image = input.required<ImageConfig>();
  public imageStyle = input.required<ImageStyle>();
  public editMode = input<boolean>(false);

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
  protected isExternalImage = computed(() => this.url().startsWith('http'));
  protected srcset = computed(() => this.generateSrcset());

  protected generateSrcset(): string {
    // ngSrcset must be width descriptors only; IMAGE_LOADER appends &w= to imgixUrl() (the ngSrc).
    return '320w, 640w, 960w, 1280w, 1920w';
  }

    // using imgix to generate srcset based on width and height
  protected style = computed(() => {
    return {
      '--size': this.imageStyle()?.width ?? '150px',
      '--rounded': this.imageStyle()?.borderRadius ?? '5px'
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
  protected numericWidth = computed(() => {
    let w = this.width();
    if (w.endsWith('px')) w = w.replace('px', '');
    const num = parseInt(w, 10);
    return isNaN(num) ? undefined : num;
  });

  protected numericHeight = computed(() => {
    let h = this.height();
    if (h.endsWith('px')) h = h.replace('px', '');
    const num = parseInt(h, 10);
    return isNaN(num) ? undefined : num;
  });

  // styles for the img element, also supports e.g. 100%, 50vw, auto, 100px, etc.
  protected imageStyles = computed(() => {
    return {
      'object-fit': 'contain',
      'width': this.width(),
      'height': this.height()
    };
  });

  // fill mode requires the container to have position:relative and an explicit height.
  // height may arrive as a plain number string (e.g. '329') or with a unit ('329px' / '50%').
  // Plain numbers are treated as px so that ngStyle emits a valid CSS value.
  protected containerStyles = computed(() => {
    if (!this.fill()) return {};
    const h = this.height();
    if (h === 'auto') return { 'height': '400px' };
    const cssHeight = /^\d+(\.\d+)?$/.test(h) ? h + 'px' : h;
    return { 'height': cssHeight };
  });

  // that was the original idea: we do not use the baseImgixUrl here, because it is already provided by the provideImgixLoader for NgOptimizedImage
  // now we eplicitely add imgixBaseUrl
  protected imgixUrl = computed(() => {
    const params = getSizedImgixParamsByExtension(this.url(), this.width(), this.height());
    const url = getImgixUrl(this.url(), params);
    return url.startsWith('tenant') ? this.env.services.imgixBaseUrl + '/' + url : url;
  });

  protected thumbnailUrl = computed(() => {
    return getThumbnailUrl(this.url(), this.width(), this.height());
  });

  protected async onImageClicked(): Promise<void> {
    if (this.editMode()) return;
    switch(this.actionType()) {
      case ImageActionType.Zoom:
        await showZoomedImage(this.modalController, this.url(), '@content.type.article.zoomedImage', this.imageStyle(), this.altText(), 'full-modal');
        break;
      case ImageActionType.FollowLink:
        await Browser.open({ url: this.actionUrl() });
        break;
      case ImageActionType.Download:
        await downloadToBrowser(this.url());
        break;
      case ImageActionType.OpenDirectory:
      case ImageActionType.OpenSlider:
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
      console.log(`ImageComponent.getValue -> element found: ${key} -> value: ${value}`);
      return value;
    }
    console.log(`ImageComponent.getValue -> element not found: ${key} -> using default value: ${defaultValue}`);
    return defaultValue;
  }
}
