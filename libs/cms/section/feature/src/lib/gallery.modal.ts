import { AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, inject, input, viewChild, CUSTOM_ELEMENTS_SCHEMA, computed } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { register, SwiperContainer } from 'swiper/element/bundle';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ImageConfig, ImageStyle } from '@bk2/shared-models';
import { HeaderComponent, LabelComponent } from '@bk2/shared-ui';
import { downloadToBrowser } from '@bk2/shared-util-angular';
import { die, getSizedImgixParamsByExtension } from '@bk2/shared-util-core';

register(); // globally register Swiper's custom elements.

@Component({
  selector: 'bk-gallery-modal',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, HeaderComponent, LabelComponent, IonContent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [
    `
      html,
      body {
        position: relative;
        height: 100%;
      }
      body {
        background: #eee;
        font-family: Helvetica Neue, Helvetica, Arial, sans-serif;
        font-size: 14px;
        color: #000;
        margin: 0;
        padding: 0;
      }
      swiper-container {
        width: 100%;
        height: 100%;
      }
      swiper-slide {
        text-align: center;
        font-size: 18px;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mainSwiper {
        height: 85%;
        width: 100%;
      }
      .thumbsSwiper {
        height: 15%;
        box-sizing: border-box;
        padding: 10px 0;
      }
      .thumbsSwiper swiper-slide {
        width: 20%;
        height: 100%;
        opacity: 0.4;
      }
      .thumbsSwiper .swiper-slide-thumb-active {
        opacity: 1;
      }
    `,
  ],
  template: `
    <bk-header [title]="title()" [isModal]="true" />
    <ion-content>
      @if(images(); as images) {
      <swiper-container #mainSwiper class="mainSwiper" [loop]="false" [navigation]="true" thumbs-swiper=".thumbsSwiper" [initialSlide]="initialSlide()" autoplay="false" [effect]="effect()">
        @for(image of images; track image.url) {
        <!-- <swiper-slide>
              <bk-img [image]="image" [imageStyle]="imageStyle()" />
            </swiper-slide> -->
        <swiper-slide [style]="getBackgroundStyle(image)" />
        }
      </swiper-container>
      <swiper-container #thumbsSwiper class="thumbsSwiper" space-between="10" slides-per-view="6" loop="false" free-mode="true" watch-slides-progress="true">
        @for(image of images; track image.url) {
        <swiper-slide [style]="getBackgroundStyle(image)" />
        }
      </swiper-container>
      } @else {
      <bk-label>{{ '@content.section.error.noImages' | translate | async }}</bk-label>
      }
    </ion-content>
  `,
})
export class GalleryModalComponent implements AfterViewInit {
  protected readonly appStore = inject(AppStore);

  // inputs
  protected images = input.required<ImageConfig[]>();
  protected imageStyle = input.required<ImageStyle>();
  protected initialSlide = input(0);
  protected title = input.required<string>();
  protected effect = input('slide');


  protected baseImgixUrl = this.appStore.services.imgixBaseUrl();
  private readonly mainSwiper = viewChild<SwiperContainer>('mainSwiper');

  // derived values
  protected readonly width = computed(() => this.imageStyle().width);
  protected readonly height = computed(() => this.imageStyle().height);
  /*
  tbd: 
  - set initial slide
  - download Button on image
  - EXIF data overlay
  - done / responsive:  slides-per-view:  2 - 6
  - done / better image layout
  - download all images https://stackoverflow.com/questions/41461337/how-to-download-entire-folder-from-firebase-storage
  - done / show movies or list them separately
  - done / unshow documents or list them separately
  */

  ngAfterViewInit(): void {
    const swiper = this.mainSwiper();
    if (swiper) {
      //  _wiper.initialSlide = this.initialSlide();
      console.log('GalleryModalComponent -> mainSwiper: ', swiper);
      /*    if (swiper.swiper) {
        console.log('activeIndex: ', swiper.swiper.activeIndex);
        console.log('autoplay: ', swiper.swiper.autoplay.running);  
        swiper.swiper.slideTo(this.initialSlide());
      }
      swiper.initialSlide = this.initialSlide(); */
    }
  }

  public download(image: ImageConfig) {
    if (image.url) {
      downloadToBrowser(image.url);
    }
  }

  protected getBackgroundStyle(image: ImageConfig) {
    if (!image.url) die('GalleryModalComponent: image url must be set');
    const params = getSizedImgixParamsByExtension(image.url, this.width(), this.height());
    const url = this.baseImgixUrl + '/' + image.url + '?' + params;
    return {
      'background-image': `url(${url})`,
      'min-height': '200px',
      'background-size': 'cover',
      'background-position': 'center',
      border: '1px',
    };
  }
}
