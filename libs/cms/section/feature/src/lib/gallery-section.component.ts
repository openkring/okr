import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { register } from 'swiper/element/bundle';

import { Image, SectionModel } from '@bk2/shared/models';
import { LabelComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { die, getSizedImgixParamsByExtension } from '@bk2/shared/util-core';
import { downloadToBrowser } from '@bk2/shared/util-angular';
import { AppStore } from '@bk2/shared/feature';

register(); // globally register Swiper's custom elements.

@Component({
  selector: 'bk-gallery-section',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslatePipe, AsyncPipe,
    SpinnerComponent, LabelComponent, OptionalCardHeaderComponent
  ],
  styles: [`
    html, body { position: relative; height: 100%; }

    body { background: #eee; font-family: Helvetica Neue, Helvetica, Arial, sans-serif; font-size: 14px; color: #000; margin: 0; padding: 0;}
    swiper-container { width: 100%; height: 100%;}
    swiper-slide { text-align: center; font-size: 18px; background: #fff; display: flex; align-items: center; justify-content: center;}
    swiper-slide bk-img { display: block; width: 100%; height: 100%; object-fit: cover;}
    .mainSwiper { height: 400px; width: 100%; }
    .thumbsSwiper { height: 100px; box-sizing: border-box; padding: 10px 0; }
    .thumbsSwiper swiper-slide { width: 20%; height: 100%; opacity: 0.4; }
    .thumbsSwiper .swiper-slide-thumb-active { opacity: 1;}
  `],
  template: `
    <ion-card>
      @if(section(); as section) {
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content background="black">
          @if(imageList(); as images) {
            <swiper-container #mainSwiper class="mainSwiper" [navigation]="true" loop=false
            thumbs-swiper=".thumbsSwiper" [initialSlide]="initialSlide()" [autoplay]="true" [effect]="imageEffect()">
              @for(image of images; track $index) {
                <swiper-slide [style]="getBackgroundStyle(image)" (click)="show(image)" />
              }
            </swiper-container>
            <swiper-container #thumbsSwiper class="thumbsSwiper" space-between=10 slides-per-view="4" loop=false
            free-mode=true watch-slides-progress=true>
              @for(image of images; track $index) {
                <swiper-slide [style]="getBackgroundStyle(image)"/>
              }
            </swiper-container>
          } @else {
            <bk-label>{{ '@content.section.error.noImages' | translate | async }}</bk-label>
          }
        </ion-card-content>
      } @else {
        <bk-spinner />
      }
    </ion-card>
  `
})
export class GallerySectionComponent {
  private readonly appStore = inject(AppStore);

  public section = input<SectionModel>();
  protected initialSlide = input(2);
  protected imageEffect = input('slide');

  protected readonly imageList = computed(() => this.section()?.properties.imageList ?? []);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);  

  public show(image: Image): void {
    downloadToBrowser(this.getImgixUrlFromImage(image));
  }

  protected getBackgroundStyle(image: Image) {
    return { 
      'background-image': `url(${this.getImgixUrlFromImage(image)})`, 
      'min-height': '200px',
      'background-size': 'cover',
      'background-position': 'center',
      'border': '1px'
    };
  }

  private getImgixUrlFromImage(image: Image): string {
    if (!image.url) die('GallerySectionComponent.getImgixUrlFromImage: image url must be set');
    if (!image.width || !image.height) die('GallerySectionComponent.getImgixUrlFromImage: image width and height must be set');
    const _params = getSizedImgixParamsByExtension(image.url, image.width, image.height);
    return this.appStore.services.imgixBaseUrl() + '/' + image.url + '?' + _params;
  }
}
