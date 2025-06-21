import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, ElementRef, inject, input, linkedSignal, viewChild } from '@angular/core';
import { AsyncPipe, NgStyle } from '@angular/common';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, IonThumbnail, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

import { debugData, debugMessage, downloadToBrowser } from '@bk2/shared/util';
import { AlbumStyle, Image, ImageAction, ImageType, SectionModel } from '@bk2/shared/models';
import { JpgUrlPipe, PdfUrlPipe, SvgIconPipe, ThumbnailUrlPipe } from '@bk2/shared/pipes';
import { CategoryComponent, ImageComponent, LabelComponent, SpinnerComponent, VideoComponent, browse, showZoomedImage } from '@bk2/shared/ui';

import { AlbumStyles, convertThumbnailToFullImage, getBackgroundStyle } from '@bk2/cms/section/util';
import { AlbumStore } from './album-section.store';

/**
 * A Section that shows a hierarchical file structure as an album.
 * All files within a directory are listed with thumbnail images.
 * There are several styles to display the images: grid, pinterest, imgix, list, avatarList.
 * A click on an image can trigger different actions: zoom, open directory, open file, open link, open modal, open dialog (configurable ImageAction).
 * 
 * TBD:
 * - change dir icon to dir and name of dir (later: add a background image)
 * - optimize the styling of the images (e.g. imgix)
 * - add a toolbar in AlbumSection to allow the user to change the album style
 * - show exif info for images as an overlay (imgix fm=json)
 * - support non-image files (thumbnail for pdfs, other files should be presented with the filetype icons)
 * - implement the different image actions
 * - implement multiple file upload (drag and drop)
 */
@Component({
  selector: 'bk-album-section',
  imports: [
    NgStyle,
    TranslatePipe, AsyncPipe, SvgIconPipe, JpgUrlPipe, PdfUrlPipe, ThumbnailUrlPipe,
    SpinnerComponent, LabelComponent, ImageComponent, CategoryComponent, VideoComponent,
    IonCard, IonCardContent, IonList, IonThumbnail,
    IonGrid, IonRow, IonCol, IonItem, IonToolbar, IonTitle, IonIcon, IonLabel
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    ion-label { text-align: center; }
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}

    @media(min-width: 0px) { .pinterest-album { column-count: 2; } }
    @media(min-width: 420px) { .pinterest-album { column-count: 3; } }
    @media(min-width: 720px) { .pinterest-album { column-count: 4; } }
    .pinterest-image { margin: 2px; text-align: center; }

    @media(min-width: 0px) { .imgix-image { sizes: 100vw; } }
    @media(min-width: 640px) { .imgix-image { sizes: 50vw; } }
    @media(min-width: 960px) { .imgix-image { sizes: 33vw; } }
  `],
  providers: [AlbumStore],
  template: `
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      <ion-toolbar>
        <ion-grid>
          <ion-row>
            <ion-col size="8">
                @if(isTopDirectory() === false) {
                  <ion-item lines="none">
                    <ion-icon src="{{ 'arrow-up-circle' | svgIcon}}" (click)="goUp()" slot="start" />
                    <ion-title>{{ title() }}</ion-title>
                  </ion-item>
                } @else {
                  <ion-title>Album</ion-title>
                }
            </ion-col>
            <ion-col size="4">
                <bk-cat name="albumStyle" [value]="selectedAlbumStyle()" [categories]="albumStyles" (changed)="onCategoryChange($event)" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
      <ion-card>
        <ion-card-content>
            @if(images(); as images) {
              @switch (albumStyle()) {
                @case(AS.Pinterest) {
                  <!--
                    With Pinterest-style album, the images are not strictly aligned and just take the
                    space available.
                    source: https://ionicacademy.com/ionic-image-gallery-responsive/ 
                  -->
                  <div class="pinterest-album">
                    @for(image of images; track image) {
                      @if(image.url; as url) {
                        <div class="pinterest-image">
                          @switch(image.imageType) {
                            @case(IT.Dir) {
                              <img [src]="url | jpgUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                              <ion-label>{{ image.imageLabel }}</ion-label>
                            } @case(IT.Image) {
                              <img [src]="url | jpgUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                            } @case(IT.StreamingVideo) {
                              <bk-video [url]="image.url" />
                            } @case (IT.Pdf) {
                              <img [src]="url | pdfUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                            }
                            @default {
                              <img [src]="url | jpgUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                              <ion-label>{{ image.imageLabel }}</ion-label>
                            }
                          }
                        </div>
                      }
                    }
                  </div>
                }
                @case(AS.Imgix) {
                  <div class="imgix-album">
                    @for(image of images; track image) {
                      @if(image.url; as url) {
                        <div class="imgix-image">
                          @switch(image.imageType) {
                            @case(IT.Dir) {
                              <bk-img [image]="image"  (click)="onImageClicked(image)"/>
                              <ion-label>{{ image.imageLabel }}</ion-label>
                            } @case(IT.Image) {
                              <bk-img [image]="convertThumbnailToFullImage(image)"  (click)="onImageClicked(image)"/>
                            } @case(IT.StreamingVideo) {
                              <bk-video [url]="image.url" />
                            } @case (IT.Pdf) {
                              <img [src]="image.url | pdfUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                            }
                            @default {
                              <bk-img [image]="image"  (click)="onImageClicked(image)"/>
                              <ion-label>{{ image.imageLabel }}</ion-label>
                            }
                          }
                        </div>
                      }
                    }
                  </div>

                }
                @case(AS.List) {
                  <ion-list>
                    @for(image of images; track image) {
                      <ion-item (click)="onImageClicked(image)">
                        <ion-label>{{ image.imageLabel }}</ion-label>
                      </ion-item>
                    }
                  </ion-list>
                }
                @case(AS.AvatarList) {
                  <ion-list>
                    @for(image of images; track image) {
                      @if(image.url; as url) {
                        <ion-item>
                          <ion-thumbnail slot="start">
                            <img [src]="url | thumbnailUrl" [alt]="image.altText" (click)="onImageClicked(image)" (keyup.enter)="onImageClicked(image)" tabindex="0"/>
                          </ion-thumbnail>
                          <ion-label>{{ image.imageLabel }}</ion-label>
                        </ion-item>
                      }
                    }
                  </ion-list>
                }
                @default { <!-- grid -->
                  <!-- 
                    we set the image to the background-image attribute of a div so we
                    can scale it to fill the whole column more easily.
                    source: https://ionicacademy.com/ionic-image-gallery-responsive/ 
                  -->
                  <ion-grid>
                    <ion-row>
                      @for(image of images; track image; let i = $index) {
                        @if(image.url; as url) {
                          <!-- 2 images on small screens, 3 on medium, 4 images on large screens -->
                          <ion-col size="6" size-xl="3" size-md="4">
                            @switch(image.imageType) {
                              @case(IT.Dir) {
                                <bk-img [image]="image" (click)="onImageClicked(image)"/>
                                <ion-label>{{ image.imageLabel }}</ion-label>
                              } @case(IT.Image) {
                                <div class="image-container" [ngStyle]="getBackgroundStyle(image)" (click)="onImageClicked(image, i)" (keyup.enter)="onImageClicked(image, i)" tabindex="0"></div>
                              } @case(IT.StreamingVideo) {
                                <bk-video [url]="image.url" />
                              } @case (IT.Pdf) {
                                <div class="image-container" [ngStyle]="getBackgroundStyle(image)" (click)="onImageClicked(image, i)" (keyup.enter)="onImageClicked(image, i)" tabindex="0"></div>
                              }
                              @default {
                                <bk-img [image]="image" (click)="onImageClicked(image)"/>
                                <ion-label>{{ image.imageLabel }}</ion-label>
                              }
                            }
                          </ion-col>
                        }
                      }
                    </ion-row>
                  </ion-grid>
                }
              }
            } @else {
              <bk-label>{{ '@content.section.error.noImages' | translate | async }}</bk-label>
            }
        </ion-card-content>
      </ion-card>
    }
  `
})
export class AlbumSectionComponent {
  private readonly modalController = inject(ModalController);
  protected albumStore = inject(AlbumStore);

  public section = input<SectionModel>();

  protected selectedAlbumStyle = linkedSignal(() => this.albumStore.albumStyle as unknown as number);
  protected imgixBaseUrl = computed(() => this.albumStore.imgixBaseUrl());
  protected imageContainer = viewChild('.imgix-image', { read: ElementRef });
  protected metaData = computed(() => this.albumStore.metaData());

  protected directory = computed(() => this.albumStore.currentDirectory());
  protected albumStyle = computed(() => this.albumStore.config().albumStyle);
  protected images = computed(() => this.albumStore.images());
  protected isLoading = this.albumStore.isLoading;
  protected error = this.albumStore.error;
  protected title = this.albumStore.title;
  protected currentDirLength = this.albumStore.currentDirLength;
  protected parentDirectory = this.albumStore.parentDirectory;
  protected isTopDirectory = computed(() => this.albumStore.currentDirLength() === this.albumStore.initialDirLength());

  protected IA = ImageAction;
  protected IT = ImageType;
  protected AS = AlbumStyle;
  protected albumStyles = AlbumStyles;

  constructor() {
    effect(() => {
      const _config = this.section()?.properties.album;
      this.albumStore.setConfig(_config); // set the album config from the section properties
      // this also updates the current directory and the albumStyle in the store
    });
  }
  
  protected async onImageClicked(image: Image, index = 0): Promise<void> {
    this.albumStore.setImage(image);    // loads metadata
    debugData('AlbumSectionComponent.onImageClicked -> image: ', image, this.albumStore.currentUser());
    debugData('AlbumSectionComponent.onImageClicked -> metaData: ', this.metaData(), this.albumStore.currentUser());
    // tbd: show the metadata to the user, e.g. in a modal or as an overlay
    // tbd: put the following into the store as a method, triggered by an effect each time the image changes
    switch (image.imageAction) {
      case ImageAction.Download: await downloadToBrowser(image.actionUrl); break;
      case ImageAction.Zoom: await showZoomedImage(this.modalController, '@content.type.article.zoomedImage', image, 'full-modal'); break;
      case ImageAction.OpenSlider: this.albumStore.openGallery(this.images(), this.title(), index); break;
      case ImageAction.OpenDirectory: this.albumStore.setDirectory(image.actionUrl); break;
      case ImageAction.FollowLink: browse(image.actionUrl); break;
      case ImageAction.None: break;
      default: debugMessage('AlbumSectionComponent.onImageClicked -> no action defined', this.albumStore.currentUser());
    }
  }

  protected getBackgroundStyle(image: Image): { [key: string]: string } {
    return getBackgroundStyle(this.imgixBaseUrl(), image);
  }

  protected onCategoryChange(albumStyle: AlbumStyle): void {
    this.albumStore.setAlbumStyle(albumStyle);
  }

  protected goUp(): void {
    this.albumStore.goUp();
  }

  protected convertThumbnailToFullImage(image: Image): Image {
    return convertThumbnailToFullImage(image, this.getValue('width', 900), this.getValue('height', 300));
  }

  /**
   * This is used to get the width and height of the image container element imgix-image
   * @param key 
   * @param defaultValue 
   * @returns 
   */
  private getValue(key: 'width' | 'height', defaultValue: number): number {
    const _el = this.imageContainer();
    if (_el) {
      const _value = (_el.nativeElement[key] ?? defaultValue) as number;
      debugMessage(`AlbumSectionComponent.getValue -> imgix-image.${key} -> ${_value}`);
      return _value;
    }
    return defaultValue;
  }
}
