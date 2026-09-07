import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, input, output, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { AlbumSection, ImageConfig, ImageType } from '@okr/shared-models';
import { SvgIconPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { browse, CategorySelect, ImageGrid, Label, openImageGallery, Spinner } from '@okr/shared-ui';
import { downloadToBrowser } from '@okr/shared-util-angular';

import { FolderBreadcrumb } from '@okr/content-folder-ui';


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
    SvgIconPipe, ThumbnailUrlPipe,
    Spinner, Label, CategorySelect, ImageGrid, FolderBreadcrumb,
    IonCard, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonToolbar, IonTitle, IonIcon
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}

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
              @if(showStyleSelect() && albumStyles().items.length > 0) {
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
            <okr-image-grid [images]="images()" [imageStyle]="imageStyle()" [imgixBaseUrl]="imgixBaseUrl()"
              [albumStyle]="albumStyle()" (imageClicked)="onImageClicked($event)" />
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
  /**
   * Deep link into a subfolder of the album. Empty (the default) starts at the configured root.
   * Kept in sync both ways: a change here browses there, and browsing emits folderChanged.
   */
  public folder = input<string>('');
  /** The album-style picker is editor chrome — a host that hard-configures the style hides it. */
  public showStyleSelect = input(true);

  // outputs
  /** The folder the user browsed to, so a host can reflect it in the URL. */
  public folderChanged = output<string>();

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

  constructor() {
    effect(() => {
      const section = this.section();
      const folder = this.folder();
      // untracked: both methods read store state, which would otherwise re-run this effect on
      // every browse step — setConfig would then reset the position the user just navigated to.
      untracked(() => {
        this.store.setConfig(section?.properties, section?.name, section?.okey);
        if (folder) this.store.setFolder(folder);
      });
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
    await openImageGallery(this.modalController, gallery, image, this.imageStyle());
  }

  protected onAlbumStyleChange(albumStyle: string): void {
    this.store.setAlbumStyle(albumStyle);
  }

  protected openFolder(folderKey: string): void {
    if (this.editMode()) return;
    this.store.setFolder(folderKey);
    this.folderChanged.emit(this.currentFolderKey());
  }

  protected goUp(): void {
    if (this.editMode()) return;
    this.store.goUp();
    this.folderChanged.emit(this.currentFolderKey());
  }
}
