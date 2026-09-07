import { NgStyle } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output } from '@angular/core';
import { IonCol, IonGrid, IonItem, IonLabel, IonList, IonRow, IonThumbnail } from '@ionic/angular/standalone';

import { BackgroundStyle, ImageConfig, ImageStyle, ImageType } from '@okr/shared-models';
import { JpgUrlPipe, PdfUrlPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { getBackgroundStyle } from '@okr/shared-util-core';

import { Video } from './video';

/**
 * The thumbnails of an album, in one of the album_style layouts, emitting the image the user
 * picked. Presentation only: it neither loads the images nor decides what happens on a click,
 * which is what lets the CMS album section (Firestore-backed, authenticated) and the public
 * album (publicApi-backed, anonymous) render identically from two very different sources.
 */
@Component({
  selector: 'okr-image-grid',
  standalone: true,
  imports: [
    NgStyle, JpgUrlPipe, PdfUrlPipe, ThumbnailUrlPipe, Video,
    IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonThumbnail
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    @media(min-width: 0px) { .pinterest-album { column-count: 2; } }
    @media(min-width: 420px) { .pinterest-album { column-count: 3; } }
    @media(min-width: 720px) { .pinterest-album { column-count: 4; } }
    .pinterest-image { margin: 2px; text-align: center; }
  `],
  template: `
    @switch (albumStyle()) {
      @case('pinterest') {
        <!-- images are not strictly aligned and just take the space available -->
        <div class="pinterest-album">
          @for(image of images(); track $index) {
            <div class="pinterest-image">
              @switch(image.type) {
                @case(IT.StreamingVideo) { <okr-video [url]="image.url" /> }
                @case(IT.Pdf) { <img [src]="image.url | pdfUrl" [alt]="image.altText" (click)="imageClicked.emit(image)" /> }
                @default { <img [src]="image.url | jpgUrl" [alt]="image.altText" (click)="imageClicked.emit(image)" /> }
              }
            </div>
          }
        </div>
      }
      @case('list') {
        <ion-list>
          @for(image of images(); track $index) {
            <ion-item button (click)="imageClicked.emit(image)">
              <ion-label>{{ image.label }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
      @case('avatar') {
        <ion-list>
          @for(image of images(); track $index) {
            <ion-item button (click)="imageClicked.emit(image)">
              <ion-thumbnail slot="start">
                <img [src]="image.url | thumbnailUrl" [alt]="image.altText" />
              </ion-thumbnail>
              <ion-label>{{ image.label }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
      @default { <!-- grid (default) and imgix -->
        <ion-grid>
          <ion-row>
            @for(image of images(); track $index) {
              <!-- 2 images on small screens, 3 on medium, 4 on large screens -->
              <ion-col size="6" size-xl="3" size-md="4">
                @switch(image.type) {
                  @case(IT.StreamingVideo) { <okr-video [url]="image.url" /> }
                  @default {
                    <div class="image-container" [ngStyle]="backgroundStyle(image)" (click)="imageClicked.emit(image)"></div>
                  }
                }
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      }
    }
  `
})
export class ImageGrid {
  // inputs
  public images = input.required<ImageConfig[]>();
  public imageStyle = input.required<ImageStyle>();
  public imgixBaseUrl = input.required<string>();
  public albumStyle = input('grid');

  // outputs
  public imageClicked = output<ImageConfig>();

  // passing constants to template
  protected IT = ImageType;

  protected backgroundStyle(image: ImageConfig): BackgroundStyle {
    return getBackgroundStyle(this.imgixBaseUrl(), this.imageStyle(), image.url, image);
  }
}
