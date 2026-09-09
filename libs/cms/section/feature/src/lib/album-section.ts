import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AlertController, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';
import { AlbumSection, ImageConfig, ImageType } from '@okr/shared-models';
import { SvgIconPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { browse, CategorySelect, ImageGrid, Label, openImageGallery, showVideoView, Spinner } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';
import { downloadToBrowser, showToast } from '@okr/shared-util-angular';

import { FolderBreadcrumb } from '@okr/content-folder-ui';
import { canUploadIntoFolder } from '@okr/content-folder-util';
import { hasRendering, resolveRendering } from '@okr/content-document-util';


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
          @if(folders().length > 0 && foldersVisible()) {
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
              [albumStyle]="albumStyle()" [pendingLabel]="store.i18n.album_video_pending()" (imageClicked)="onImageClicked($event)" />
          } @else if(folders().length === 0 || !foldersVisible()) {
            <okr-label>{{ store.i18n.album_empty() }}</okr-label>
          }
        </ion-card-content>
      </ion-card>
    }
  `
})
export class AlbumSectionComponent {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly i18nService = inject(I18nService);
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
  /**
   * Whether the subfolder tiles are shown. Purely a view preference of this visit — nothing is
   * persisted, so a shared link always opens with the folders visible.
   */
  protected readonly foldersVisible = signal(true);

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
   * download and an info button (storage metadata + EXIF). Videos open the full-screen player;
   * everything else besides images is still downloaded / opened.
   */
  protected async onImageClicked(image: ImageConfig): Promise<void> {
    if (this.editMode()) return;
    if (image.type === ImageType.Video) {
      // Das Dokument trägt das mp4-Rendering; ohne es läuft die Transkodierung noch.
      const doc = this.store.visibleDocuments().find((d) => d.okey === image.documentKey);
      if (!doc || !hasRendering(doc, 'mp4')) {
        await showToast(this.store.toastController, this.store.i18n.album_video_pending());
        return;
      }
      // i18n über den Store, wie album_style_header und album_cover_apply daneben.
      await showVideoView(this.modalController, resolveRendering(doc, 'mp4'), image.actionUrl, {
        title: image.label || this.store.i18n.album_video_title(),
        download: this.store.i18n.album_video_download(),
        close: this.store.i18n.album_video_close(),
        error: this.store.i18n.album_video_error()
      });
      return;
    }
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

  /* ---------------- operations of the album context menu (c-album) ----------------
     Public because the hosting page owns the menu: the album owns the folder currently
     browsed, so every one of these has to be answered here rather than by the page. */

  /** Pack every visible file of the current folder into one zip. */
  public async downloadAll(): Promise<void> {
    await this.store.downloadAll();
  }

  /** CSV listing of the files of the current folder. */
  public async exportCsv(): Promise<void> {
    await this.store.exportCsv();
  }

  /** Full-screen slideshow over the images of the current folder. */
  public async startSlideshow(): Promise<void> {
    await this.store.startSlideshow();
  }

  /** Create a subfolder below the folder currently browsed and step into it. */
  public async addFolder(): Promise<void> {
    await this.store.addFolder();
    this.folderChanged.emit(this.currentFolderKey());
  }

  /** Choose which image represents this folder as a tile in its parent album. */
  public async selectCover(): Promise<void> {
    await this.store.selectCover();
  }

  /**
   * Whether the current folder shows any FILE at all — a folder holding only subfolders (the
   * root of an album, typically) shows none. Note this counts what the album actually renders,
   * after the showPdfs/showDocs/showVideos filter: a folder of PDFs in an album configured to
   * hide PDFs has no files by this measure, which is the right answer for a menu row that would
   * act on them.
   */
  public readonly hasVisibleFiles = computed(() => this.images().length > 0);

  /**
   * Whether the current user may upload into the folder currently open. Mirrors the `docs`
   * create rule, so the menu never offers an upload that Firestore will refuse — a plain member
   * on a folder without `membersMayUpload` used to get the file dialog, pick photos, and then a
   * "Missing or insufficient permissions" error per file.
   */
  public readonly canUpload = computed(() => canUploadIntoFolder(this.store.currentFolder(), this.store.currentUser()));

  /**
   * Whether any of those files is an IMAGE. Narrower than `hasVisibleFiles` on purpose: a
   * slideshow and a cover picker need pictures, while a download or a CSV listing is happy with
   * a folder of PDFs.
   */
  public readonly hasImages = computed(() => this.images().some((image) => image.type === ImageType.Image));

  /** Show/hide the subfolder tiles; returns the new state so the caller can reflect it. */
  public toggleFolders(): boolean {
    this.foldersVisible.update((visible) => !visible);
    return this.foldersVisible();
  }

  /**
   * Switch the album layout (grid | pinterest | imgix | list | avatar) from the context menu.
   * The style names are category items, so their labels are runtime keys — resolved through
   * `createLabelResolver` rather than the store's static i18n map.
   */
  public async selectStyle(): Promise<void> {
    const category = this.albumStyles();
    const items = category?.items ?? [];
    if (items.length === 0) return;

    const label = await this.i18nService.createLabelResolver(category);
    const current = this.albumStyle();
    const alert = await this.alertController.create({
      header: this.store.i18n.album_style_header(),
      inputs: items.map((item) => ({
        name: 'albumStyle',
        type: 'radio' as const,
        label: label(item.name),
        value: item.name,
        checked: item.name === current
      })),
      buttons: [
        { text: this.store.i18n.cancel(), role: 'cancel' },
        { text: this.store.i18n.album_cover_apply(), role: 'confirm' }
      ]
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;
    const albumStyle = (data as { values?: string } | undefined)?.values ?? '';
    if (albumStyle) this.store.setAlbumStyle(albumStyle);
  }
}
