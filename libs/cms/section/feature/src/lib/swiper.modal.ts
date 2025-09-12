import { AsyncPipe } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, input } from '@angular/core';
import { IonCard, IonCardContent, IonContent } from '@ionic/angular/standalone';
import { register } from 'swiper/element/bundle';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Image } from '@bk2/shared-models';
import { HeaderComponent, ImageComponent, SpinnerComponent } from '@bk2/shared-ui';

register(); // globally register Swiper's custom elements.

/**
 * This modal requests a user to select an image file and provide some metadata about the image.
 */
@Component({
  selector: 'bk-swiper-modal',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, SpinnerComponent, ImageComponent,
    IonContent, IonCard, IonCardContent,    
  ],
  styles: [`
    html, body { position: relative; height: 100%; }
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}

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
      justify-content: center;
      align-items: center;
    }
    swiper-slide bk-img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `],
  template: `
      <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
      <ion-content>
        @if(imageList(); as images) {
          <ion-card>
            <ion-card-content background="black">
              <swiper-container class="mySwiper" loop="true" navigation="true"  style="width: 100%;"
                pagination="true" keyboard="true" mousewheel="true" css-mode="true">
                @for(image of imageList(); track image.url) {
                  <swiper-slide>
                    <bk-img [image]="image" />
                  </swiper-slide>
                }
              </swiper-container>
            </ion-card-content>
          </ion-card>
        } @else {
          <bk-spinner />
        }
      </ion-content>
  `
})
export class SwiperModalComponent {
  protected imageList = input.required<Image[]>();
  protected title = input.required<string>();
}
