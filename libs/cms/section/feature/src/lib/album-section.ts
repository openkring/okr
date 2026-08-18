import { NgStyle } from '@angular/common';
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, IonThumbnail, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { AlbumSection, BackgroundStyle, ImageConfig, ImageType } from '@okr/shared-models';
import { JpgUrlPipe, PdfUrlPipe, SvgIconPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { browse, CategorySelect, Label, Spinner, showZoomedImage, Video } from '@okr/shared-ui';
import { downloadToBrowser } from '@okr/shared-util-angular';

import { FolderBreadcrumb } from '@okr/content-folder-ui';

import { getBackgroundStyle } from '@okr/cms-section-util';

import { AlbumStore } from './album-section.store';

/**
 * A Section that shows an album of folders and documents (see the folder/document domains).
 * It starts at AlbumConfig.folder — or, when that is empty, at the folder whose okey equals the
 * section name — and lets the user browse into its subfolders.
 * A folder is rendered with the first image it contains as background, overlaid with the folder
 * icon and its name. Clicking an image opens the full-screen viewer (prev/next/download/info).
 * The album style (grid | pinterest | imgix | list | avatar) comes from the 'album_style' category.
 */
@Component({
  selector: 'okr-album-section',
  standalone: true,
  imports: [
    NgStyle,
    SvgIconPipe, JpgUrlPipe, PdfUrlPipe, ThumbnailUrlPipe,
    Spinner, Label, CategorySelect, Video, FolderBreadcrumb,
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

    .folder-tile {
      position: relative;
      width: 100%;
      padding-bottom: 75%;
      overflow: hidden;
      border-radius: 6px;
      background: var(--ion-color-light);
      cursor: pointer;
    }
    .folder-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .folder-tile img.folder-logo { object-fit: contain; padding: 12%; opacity: 0.6; }
    .folder-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      text-align: center;
      padding: 4px;
    }
    .folder-overlay ion-icon { font-size: 2rem; }
    .folder-overlay span { font-size: 0.85rem; font-weight: 600; overflow-wrap: anywhere; }
  `],
  providers: [AlbumStore],
  template: `
    @if(isLoading()) {
      <okr-spinner />
    } @else {
      <ion-toolbar>
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="8">
              <ion-item lines="none">
                @if(isTopFolder() === false) {
                  <ion-icon src="{{ 'arrow-up-circle' | svgIcon}}" (click)="goUp()" slot="start" />
                }
                @if(currentFolderKey(); as folderKey) {
                  <okr-folder-breadcrumb [folderKey]="folderKey" (folderSelected)="openFolder($event)" />
                } @else {
                  <ion-title>{{ title() }}</ion-title>
                }
              </ion-item>
            </ion-col>
            <ion-col size="6" size-md="4">
              <!-- the category is empty until the reference data has loaded — okr-cat-select needs at least one item -->
              @if(albumStyles().items.length > 0) {
                <okr-cat-select [category]="albumStyles()" [selectedItemName]="albumStyle()"
                  (selectedItemNameChange)="onAlbumStyleChange($event)" [withAll]="false" [readOnly]="false" />
              }
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
      <ion-card>
        <ion-card-content>
          <!-- subfolders: cover image (or light background) + folder icon and name overlay -->
          @if(folders().length > 0) {
            <ion-grid>
              <ion-row>
                @for(folder of folders(); track folder.okey) {
                  <ion-col size="6" size-md="4" size-xl="3">
                    <div class="folder-tile" (click)="openFolder(folder.okey)">
                      @if(folder.coverUrl) {
                        <img [src]="folder.coverUrl | thumbnailUrl" [alt]="folder.label" loading="lazy"
                          [class.folder-logo]="folder.isLogo" />
                      }
                      <div class="folder-overlay">
                        <ion-icon src="{{ 'folder' | svgIcon }}" />
                        <span>{{ folder.label }} ({{ folder.fileCount }})</span>
                      </div>
                    </div>
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          }

          @if(images().length > 0) {
            @switch (albumStyle()) {
              @case('pinterest') {
                <!-- images are not strictly aligned and just take the space available -->
                <div class="pinterest-album">
                  @for(image of images(); track $index) {
                    <div class="pinterest-image">
                      @switch(image.type) {
                        @case(IT.StreamingVideo) { <okr-video [url]="image.url" /> }
                        @case(IT.Pdf) { <img [src]="image.url | pdfUrl" [alt]="image.altText" (click)="onImageClicked(image)" /> }
                        @default { <img [src]="image.url | jpgUrl" [alt]="image.altText" (click)="onImageClicked(image)" /> }
                      }
                    </div>
                  }
                </div>
              }
              @case('list') {
                <ion-list>
                  @for(image of images(); track $index) {
                    <ion-item button (click)="onImageClicked(image)">
                      <ion-label>{{ image.label }}</ion-label>
                    </ion-item>
                  }
                </ion-list>
              }
              @case('avatar') {
                <ion-list>
                  @for(image of images(); track $index) {
                    <ion-item button (click)="onImageClicked(image)">
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
                            <div class="image-container" [ngStyle]="getBackgroundStyle(image)" (click)="onImageClicked(image)"></div>
                          }
                        }
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>
              }
            }
          } @else if(folders().length === 0) {
            <okr-label>{{ store.i18n.album_empty() }}</okr-label>
          }
        </ion-card-content>
      </ion-card>
    }
  `
})
export class AlbumSectionComponent {
  private readonly modalController = inject(ModalController);
  protected store = inject(AlbumStore);

  // inputs
  public section = input<AlbumSection>();
  public editMode = input<boolean>(false);

  // derived
  protected imgixBaseUrl = computed(() => this.store.imgixBaseUrl());
  protected imageStyle = computed(() => this.store.imageStyle());
  protected albumStyle = computed(() => this.store.albumStyle());
  protected albumStyles = computed(() => this.store.appStore.getCategory('album_style'));
  protected images = computed(() => this.store.images());
  protected folders = computed(() => this.store.folders());
  protected isLoading = computed(() => this.store.isLoading());
  protected title = computed(() => this.store.title());
  protected isTopFolder = computed(() => this.store.isTopFolder());
  protected currentFolderKey = computed(() => this.store.currentFolderKey());

  // passing constants to template
  protected IT = ImageType;

  constructor() {
    effect(() => {
      const section = this.section();
      this.store.setConfig(section?.properties, section?.name, section?.okey);
    });
  }

  /**
   * Upload files into the folder currently browsed. Public: the hosting page owns the file input
   * (Safari needs the trusted click on a <label>) and routes the selected files here, because the
   * album owns the current folder.
   */
  public async addFiles(files: File[]): Promise<void> {
    await this.store.addFiles(files);
  }

  /**
   * Images open the full-screen viewer with prev/next across the sibling images of this folder,
   * download and an info button (storage metadata + EXIF). Other files are downloaded / opened.
   */
  protected async onImageClicked(image: ImageConfig): Promise<void> {
    if (this.editMode()) return;
    if (image.type !== ImageType.Image) {
      if (image.actionUrl) await downloadToBrowser(image.actionUrl);
      else browse(image.url);
      return;
    }
    const gallery = this.images().filter((img) => img.type === ImageType.Image);
    const startIndex = Math.max(0, gallery.findIndex((img) => img.documentKey === image.documentKey));
    await showZoomedImage(this.modalController, image.url, image.label, this.imageStyle(),
      image.altText, 'full-modal', gallery, startIndex);
  }

  protected getBackgroundStyle(image: ImageConfig): BackgroundStyle {
    return getBackgroundStyle(this.imgixBaseUrl(), this.imageStyle(), image.url, image);
  }

  protected onAlbumStyleChange(albumStyle: string): void {
    this.store.setAlbumStyle(albumStyle);
  }

  protected openFolder(folderKey: string): void {
    if (this.editMode()) return;
    this.store.setFolder(folderKey);
  }

  protected goUp(): void {
    if (this.editMode()) return;
    this.store.goUp();
  }
}
