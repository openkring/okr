import { NgOptimizedImage, NgStyle, provideImgixLoader } from '@angular/common';
import { Component, computed, ElementRef, inject, input, viewChild } from '@angular/core';
import { IonThumbnail, ModalController } from '@ionic/angular/standalone';

import { Image } from '@bk2/shared/models';
import { ImgixUrlPipe } from '@bk2/shared/pipes';
import { showZoomedImage } from './ui.util';
import { ENV } from '@bk2/shared/config';

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
    imports: [
      NgOptimizedImage, NgStyle,
      ImgixUrlPipe, 
      IonThumbnail
    ],
    providers: [
      provideImgixLoader('https://bkaiser.imgix.net')
    ],
    styles: [`
      ion-thumbnail { margin: auto; height: 100px; width: 100px; padding: 10px; text-align: right; position: relative;}
      .image-container { position: relative; display: flex; justify-content: center; align-items: center; width: 100%; height: auto; }
    `],
    template: `
      @if(image(); as image) {
        @if(isThumbnail() === true) {
          <ion-thumbnail [slot]="slot()" [ngStyle]="style()" (click)="onImageClicked()">
            <img [ngSrc]="image | imgixUrl" [alt]="image.altText" /> 
          </ion-thumbnail>
        }
        @else {
          <div class="image-container">
            <img [ngSrc]="image | imgixUrl" [alt]="image.altText" [sizes]="sizes()"
              [attr.priority]="image.hasPriority ? '' : null"
              [attr.fill]="image.fill ? '' : null"
              width="{{width()}}" 
              height="{{height()}}"
              placeholder 
            />
          </div>
        }
      }
    `
  })
  export class ImageComponent {
    private readonly modalController = inject(ModalController);
    private readonly env = inject(ENV);
    public image = input.required<Image>();
    protected imageContainer = viewChild('.image-container', { read: ElementRef });
    // we do not use the baseImgixUrl here, because it is already provided by the provideImgixLoader for NgOptimizedImage
    // protected baseImgixUrl = this.env.app.imgixBaseUrl;

    // by default, image is 100% of screen width on devices under 768px wide, and 50% on bigger screens
    // alternatively when excluding the menu: calc(100vw - 128px)
    protected sizes = computed(() => this.image().sizes ?? '(max-width: 768px) 100vw, 50vw');
    protected isThumbnail = computed(() => this.image().isThumbnail ?? false);
    protected style = computed(() => {
      return {
        '--size': this.image()?.width ?? '150px',
        '--rounded': this.image()?.borderRadius ?? '5px'
      };
    });
    protected slot = computed(() => this.image()?.slot ?? 'start');
    protected width = computed(() => {
      const _width = this.image()?.width;
      return !_width ? this.getValue('width', 'auto') : _width;
    });
    protected height = computed(() => {
      const _height = this.image()?.height;
      return !_height ? this.getValue('height', 'auto') : _height;
    });

    protected async onImageClicked(): Promise<void> {
      await showZoomedImage(this.modalController, '@content.type.article.zoomedImage', this.image(), 'full-modal');
    }

    private getValue(key: string, defaultValue: string): string {
      const _el = this.imageContainer();
      if (_el) {
        const _value = _el.nativeElement[key] ?? defaultValue;
        console.log(`ImageComponent.getValue -> element found: ${key} -> value: ${_value}`);
        return _value;
      }
      console.log(`ImageComponent.getValue -> element not found: ${key} -> using default value: ${defaultValue}`);
      return defaultValue;
    }
  }
