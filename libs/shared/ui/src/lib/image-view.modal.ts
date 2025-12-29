import { provideImgixLoader } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { ImageStyle } from '@bk2/shared-models';
import { ENV } from '@bk2/shared-config';
import { getImgixUrl, getSizedImgixParamsByExtension } from '@bk2/shared-util-core';

import { HeaderComponent } from './header.component';

@Component({
  selector: 'bk-image-view-modal',
  standalone: true,
  imports: [
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
      <bk-header [title]="title()" [isModal]="true" />
      <ion-content>
          <div class="image-container">
            <img [src]="imgixUrl()"
              [alt]="altText()"
              style="max-width: 100%; max-height: 100%; object-fit: contain;"
            />
          </div>
      </ion-content>
  `
})
export class ImageViewModalComponent {
  private env = inject(ENV);

  // inputs
  public url = input.required<string>();
  public altText = input('');
  public title = input('');
  public style = input.required<ImageStyle>();

  // passing constants to the template
  protected imgixBaseUrl = this.env.services.imgixBaseUrl;

  // computed
  protected width = computed(() => this.style().width ?? '160');
  protected height = computed(() => this.style().height ?? '90');

  protected imgixUrl = computed(() => {
    const params = getSizedImgixParamsByExtension(this.url(), this.width(), this.height());
    const prefix = this.url().startsWith('/') ? this.imgixBaseUrl : this.imgixBaseUrl + '/';
    return prefix + getImgixUrl(this.url(), params);
  });
  
/*   protected imageContainer = viewChild('.image-container', { read: ElementRef });
  protected sizes = computed(() => this.style().sizes ?? '(max-width: 768px) 100vw, 50vw');
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



