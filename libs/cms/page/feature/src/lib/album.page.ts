import { Component, computed, inject, input } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { Header, Spinner } from '@okr/shared-ui';
import { coerceBoolean, extractFirstPartOfOptionalTupel } from '@okr/shared-util-core';
import { keepDefaultTrue } from '@okr/shared-util-angular';

import { AlbumSectionComponent } from '@okr/cms-section-feature';
import { createSection } from '@okr/cms-section-util';
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
    Header, Spinner, AlbumSectionComponent,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonContent
  ],
  styles: [`
  okr-section { width: 100%; }
`],
  template: `
    @if(id(); as id) {
      @if(showToolbar()) {
        <okr-header [i18n]="{ title: headerTitle() }" [isRoot]="true" />
      }
      <ion-content>
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
