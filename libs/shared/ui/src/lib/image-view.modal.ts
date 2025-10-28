import { AsyncPipe, NgOptimizedImage, provideImgixLoader } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { Image } from '@bk2/shared-models';
import { ImgixUrlPipe } from '@bk2/shared-pipes';

import { HeaderComponent } from './header.component';
import { ENV } from '@bk2/shared-config';

@Component({
  selector: 'bk-image-view-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, ImgixUrlPipe,
    HeaderComponent,
    IonContent
  ],
  providers: [
    provideImgixLoader('https://bkaiser.imgix.net')
  ],
  styles: [`
    .image-container {
      max-width: 600px;
      max-height: 80dvh;
      margin: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    .image-container img {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain
    }
  `],
  template: `
      <bk-header title="{{ title() | translate | async }}" [isModal]="true" />
      <ion-content>
        @if(image(); as image) {
          <div class="image-container">
            <img [src]="(image | imgixUrl:imgixBaseUrl())"
              [alt]="image.altText"
              style="max-width: 100%; max-height: 100%; object-fit: contain;"
            />
          </div>
        }
      </ion-content>
  `
})
export class ImageViewModalComponent {
  private env = inject(ENV);
  public image = input.required<Image>();
  public title = input('');

  protected imgixBaseUrl = computed(() => this.env.services.imgixBaseUrl);

/*   protected imageContainer = viewChild('.image-container', { read: ElementRef });
  protected sizes = computed(() => this.image().sizes ?? '(max-width: 768px) 100vw, 50vw');
  protected containerStyle = computed(() => {
    const img = this.image();
    if (!img.width || !img.height) return {};

    const max = 600;
    const scale = Math.min(max / +img.width, max / +img.height, 1);
    const w = +img.width * scale;
    const h = +img.height * scale;

    return { width: `${w}px`, height: `${h}px` };
  }) */
}



