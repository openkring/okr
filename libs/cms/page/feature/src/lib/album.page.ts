import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonPopover, IonTitle, IonToolbar, ToastController } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, Spinner } from '@okr/shared-ui';
import { coerceBoolean, extractFirstPartOfOptionalTupel } from '@okr/shared-util-core';
import { copyToClipboardWithConfirmation, error, keepDefaultTrue } from '@okr/shared-util-angular';

import { Menu } from '@okr/cms-menu-feature';
import { AlbumSectionComponent } from '@okr/cms-section-feature';
import { createSection, SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { DEFAULT_ACCEPT_ATTRIBUTE } from '@okr/shared-constants';
import { ALBUM_CONFIG_SHAPE, AlbumSection, FolderModel } from '@okr/shared-models';

import { FolderService } from '@okr/content-folder-data-access';

/**
 * A full page rendering one album, rooted at a storage folder.
 *
 * Reached two ways, and the direct route is the one that matters for deep links:
 *  - `/album/<folderKey>/<contextMenuName>` — no Firestore artefact at all, the section config is
 *    synthesized here from the route. This is what an event's `url` field points at.
 *  - `PageDispatcher`'s `@case ('album')` for a PageModel of `type: 'album'`.
 *
 * Query parameters override the synthesized config, so one route serves every variation:
 *   ?style=grid|pinterest|imgix|list|avatar   album layout
 *   ?pdfs / ?docs / ?videos / ?streaming      which file classes are shown (booleans)
 *   ?folder=<subfolderKey>                    open (and stay linkable) in a subfolder
 *   ?styleSelect=true                         re-show the album-style picker
 *   ?showMenu=false                           hide the toolbar (embedding in an external site)
 * Defaults come from ALBUM_CONFIG_SHAPE, i.e. images and PDFs in a grid.
 */
@Component({
  selector: 'okr-album-page',
  standalone: true,
  imports: [
    SvgIconPipe,
    Header, Spinner, AlbumSectionComponent, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonPopover, IonContent
  ],
  styles: [`
  okr-section { width: 100%; }

  .upload-hint { margin: 0.5rem 1rem; font-size: 0.8rem; color: var(--ion-color-medium); }

  /* Printing an album means printing the pictures: drop the app chrome and let the grid
     break across pages. The context menu's 'print' hands the browser this stylesheet and
     nothing else — unlike a CMS page, an album has no page document to render server-side. */
  @media print {
    ion-header, ion-toolbar, okr-header, ion-menu-button { display: none !important; }
    ion-content { --offset-top: 0; --offset-bottom: 0; }
    img { break-inside: avoid; page-break-inside: avoid; }
  }
`],
  template: `
    @if(id(); as id) {
      <!-- The menu's 'files-add' row renders a <label for="doc-files-input"> — Safari only opens
           the dialog from a trusted click, not from the popover-dismiss event. Same pattern (and
           id) as the content page and the document list; kept outside all Ionic components so the
           label lookup crosses no shadow root. -->
      <input id="doc-files-input" type="file" multiple
             [accept]="acceptMimeTypes"
             style="position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;"
             (change)="onFilesSelected($event)" />
      @if(showToolbar()) {
        <!-- The route's optional :contextMenuName is only renderable here — okr-header carries no
             popover — so an album reached as /album/<folderKey>/<menuName> uses its own toolbar. -->
        @if(contextMenuName(); as menuName) {
          <ion-header>
            <ion-toolbar [color]="color()" id="bkheader">
              <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
              <ion-title>{{ headerTitle() }}</ion-title>
              <ion-buttons slot="end">
                <ion-button id="{{ popupId() }}">
                  <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
                </ion-button>
                <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                  <ng-template>
                    <ion-content>
                      <okr-menu [menuName]="menuName" [excludeNames]="hiddenMenuItems()" [toggleStates]="{ toggleFolders: foldersVisible() }" />
                    </ion-content>
                  </ng-template>
                </ion-popover>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
        } @else {
          <okr-header [i18n]="{ title: headerTitle() }" [isRoot]="true" />
        }
      }
      <ion-content>
        <!-- Datenschutz (Spec §8): eine Tonspur kann Gespräche enthalten, die die Beteiligten
             nicht als öffentlich verstanden haben. Hinweis, keine technische Sperre.
             Gehört INS ion-content: ion-page ist ein Flex-Container, und ein <p> davor wird
             dessen erstes Flex-Item — es schob Header und Inhalt nach unten. -->
        @if(canUpload()) {
          <p class="upload-hint">{{ uploadHint() }}</p>
        }
        <okr-album-section [section]="section()" [folder]="currentFolderKey()"
          [showStyleSelect]="showStyleSelect()" (folderChanged)="onFolderChanged($event)" />
      </ion-content>
    } @else {
      @if(showToolbar()) {
        <ion-header>
          <ion-toolbar color="secondary" id="bkheader">
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          </ion-toolbar>
        </ion-header>
      }
      <ion-content>
        <okr-spinner />
      </ion-content>
    }
  `
})
export class AlbumPage {
  // AppStore, not PageStore: the album needs the tenant id and nothing else from the page pipeline.
  // Injecting PageStore made the direct route depend on a page document that need not exist.
  private readonly appStore = inject(AppStore);
  private readonly folderService = inject(FolderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly i18n = inject(I18nService).translateAll(SECTION_I18N_KEYS);

  /** The rendered album — it owns the folder currently browsed, so every menu action goes there. */
  private readonly albumSection = viewChild(AlbumSectionComponent);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public id = input.required<string>();     // the okey of the FolderModel the album starts at
  // id is passed to the album-section as well where it is used as the title
  // the id can be followed by @tenantId to specify the tenantId of the owner of the album
  // e.g. 2021@p13
  // keepDefaultTrue: withComponentInputBinding() sets an unbound route input to undefined
  public showMenu = input(true, { transform: keepDefaultTrue });

  private readonly queryParamMap = toSignal(this.route.queryParamMap);
  private param(name: string): string | undefined {
    return this.queryParamMap()?.get(name) ?? undefined;
  }

  /** ?showMenu=false wins over the input, so an embedding link can hide the toolbar. */
  protected readonly showToolbar = computed(() => {
    const param = this.param('showMenu');
    return param != null ? coerceBoolean(param) : this.showMenu();
  });
  protected readonly showStyleSelect = computed(() => coerceBoolean(this.param('styleSelect') ?? false));

  /** The album's root: the route id, minus the optional `@tenantId` suffix. */
  private readonly rootFolderKey = computed(() => extractFirstPartOfOptionalTupel(this.id(), '@'));
  /** Root, or the subfolder named by ?folder= — the folder actually on screen. */
  protected readonly currentFolderKey = computed(() => this.param('folder') || this.rootFolderKey());
  /** Unique trigger id for the context-menu popover. */
  protected readonly popupId = computed(() => 'c_albumpage_' + this.rootFolderKey());

  // The header used to show the raw folder key ('p13_2024'); show the folder's own title ('2024').
  // Resolved for the folder on screen, so a deep link into a subfolder names that subfolder.
  private readonly folderResource = rxResource({
    params: () => ({ folderKey: this.currentFolderKey() }),
    stream: ({ params }) => params.folderKey
      ? this.folderService.read(params.folderKey)
      : of<FolderModel | undefined>(undefined)
  });
  protected readonly headerTitle = computed(() => {
    const folder = this.folderResource.value();
    return folder?.title || folder?.name || this.currentFolderKey();
  });

  protected readonly section = computed(() => {
    const section = createSection('album', this.appStore.tenantId()) as AlbumSection;
    section.properties = {
      ...ALBUM_CONFIG_SHAPE,
      folder: this.rootFolderKey(),
      albumStyle: this.param('style') || ALBUM_CONFIG_SHAPE.albumStyle,
      showPdfs: this.boolParam('pdfs', ALBUM_CONFIG_SHAPE.showPdfs),
      showDocs: this.boolParam('docs', ALBUM_CONFIG_SHAPE.showDocs),
      showVideos: this.boolParam('videos', ALBUM_CONFIG_SHAPE.showVideos),
      showStreamingVideos: this.boolParam('streaming', ALBUM_CONFIG_SHAPE.showStreamingVideos),
    };
    return section;
  });

  private boolParam(name: string, fallback: boolean): boolean {
    const param = this.param(name);
    return param != null ? coerceBoolean(param) : fallback;
  }

  /**
   * Mirror the browsed folder into ?folder= so the position is shareable and the back button
   * steps out of a subfolder. replaceUrl at the root: returning to the start of the album is not
   * a history entry of its own.
   */
  /** Reflected into the menu so the 'toggleFolders' row shows the state it will switch to. */
  protected readonly foldersVisible = signal(true);

  /**
   * Context-menu rows that have nothing to act on in the folder currently open, so they are not
   * offered at all rather than opening an empty dialog or a toast.
   *
   * Two tiers, because the operations need different things:
   *  - no FILE at all (an album's root folder typically holds only subfolders): the download,
   *    the view switch and the CSV listing have no subject.
   *  - no IMAGE (a folder of PDFs, say): the slideshow and the cover picker have no subject
   *    even though the other three do.
   * The first case implies the second, so an empty folder hides all five.
   */
  protected readonly hiddenMenuItems = computed(() => {
    const album = this.albumSection();
    const hidden: string[] = [];
    if (!album?.hasVisibleFiles()) hidden.push('album-download-all', 'album-style', 'album-exportraw');
    if (!album?.hasImages()) hidden.push('album-slideshow', 'album-cover');
    // The upload is role- AND folder-gated (firestore.rules `docs` create): offering it where
    // the write would be denied is what produced the "insufficient permissions" reports.
    if (!album?.canUpload()) hidden.push('files-add');
    return hidden;
  });
  protected readonly acceptMimeTypes = DEFAULT_ACCEPT_ATTRIBUTE;

  /** Same predicate `hiddenMenuItems` uses to hide 'files-add': the hint appears only where upload is allowed. */
  protected readonly canUpload = computed(() => this.albumSection()?.canUpload() ?? false);
  protected readonly uploadHint = computed(() => this.i18n.album_video_hint());

  /**
   * Upload the picked files into the folder the album is currently showing. The album owns that
   * folder, so the upload is delegated rather than handled here (same split as ContentPage).
   */
  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.albumSection()?.addFiles(files);
  }

  /**
   * Dispatch a context-menu selection. Every row of `c-album` is a `call`/`toggle`, so the value
   * arrives here as the menu item's `url`.
   */
  protected async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    const album = this.albumSection();
    switch (selectedMethod) {
      case 'addFiles': break; // handled by the toolbar label→input (Safari-compatible)
      case 'downloadAll': await album?.downloadAll(); break;
      case 'exportAlbumCsv': await album?.exportCsv(); break;
      case 'slideshow': await album?.startSlideshow(); break;
      case 'copyLink': await this.copyLink(); break;
      case 'selectStyle': await album?.selectStyle(); break;
      case 'toggleFolders': this.foldersVisible.set(album?.toggleFolders() ?? true); break;
      case 'addFolder': await album?.addFolder(); break;
      case 'selectCover': await album?.selectCover(); break;
      case 'print': window.print(); break;
      default: error(undefined, `AlbumPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  /**
   * Copy the album's current address, subfolder included — the URL already carries ?folder=, so
   * what is pasted opens exactly what the user is looking at. copyToClipboardWithConfirmation
   * carries the iOS/Capacitor fallbacks and the confirmation toast.
   */
  private async copyLink(): Promise<void> {
    await copyToClipboardWithConfirmation(this.toastController, window.location.href);
  }

  protected onFolderChanged(folderKey: string): void {
    if (folderKey === this.currentFolderKey()) return;
    const isRoot = folderKey === this.rootFolderKey();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { folder: isRoot ? null : folderKey },
      queryParamsHandling: 'merge',
      replaceUrl: isRoot
    });
  }
}
