import { Component, computed, inject, input, linkedSignal, effect, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonThumbnail, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';


import { DocumentModel, FolderModel, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, RoleName } from '@okr/shared-models';
import { DEFAULT_MIMETYPES } from '@okr/shared-constants';
import { FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe, FileLogoPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner, showZoomedImage } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error, keepDefaultTrue } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';
import { FolderBreadcrumb } from '@okr/content-folder-ui';
import { canDeleteDocument, canEditDocument, canUploadToFolder } from '@okr/content-document-util';
import { canEditFolder } from '@okr/content-folder-util';

import { DocumentStore } from './document.store';

/** vtracer takes raster input only — mirrors the guard in the vectorizeDocument CF. */
const VECTORIZABLE_MIME_TYPES = ['image/jpeg', 'image/png'];

type DocumentSortField = 'title' | 'size' | 'dateOfDocLastUpdate';

@Component({
  selector: 'okr-document-list',
  standalone: true,
  imports: [
    SvgIconPipe, FileNamePipe, FileLogoPipe, FileSizePipe, PrettyDatePipe, ThumbnailUrlPipe,
    Spinner, ListFilter, EmptyList, Menu, FolderBreadcrumb,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonPopover, IonThumbnail
  ],
  providers: [DocumentStore],
  styles: [`
    .clickable { cursor: pointer; user-select: none; }
    .droptarget { outline: 2px dashed var(--ion-color-primary); outline-offset: -2px; border-radius: 4px; }
    .dropzone { background: var(--ion-color-primary-tint); }
  `],
  template: `
  @if(canUpload()) {
    <!-- Input outside ALL Ionic web components so Safari's id lookup and
         label activation are not affected by slot/shadow DOM boundaries.
         Off-screen instead of display:none — Safari won't activate a display:none input via label. -->
    <input id="doc-files-input" type="file" multiple
           [accept]="acceptMimeTypes"
           style="position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;"
           (change)="onFilesSelected($event)" />
  }
  <ion-header>
    <!-- toolbar always renders so the folder breadcrumb is visible; in group view (contextMenuName='disable')
         the menu button, view toggle and context menu are hoisted to the group toolbar, so only the breadcrumb shows. -->
    <ion-toolbar [color]="color()">
      @if(contextMenuName() !== 'disable' && showMenuButton() === true) {
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      }
      <!-- title: folder breadcrumb when filtered by folder AND the user is loaded
           (so the folder reads aren't denied during the auth-restore window),
           otherwise the document counts. -->
      <ion-title>
        @if(folderKey(); as fkey) {
          @if(currentUser()) {
            <okr-folder-breadcrumb [folderKey]="fkey" (folderSelected)="onFolderSelected($event)" />
          }
        } @else {
          {{ filteredDocumentsCount() }}/{{ documentsCount() }} {{ store.i18n.documents() }}
        }
      </ion-title>
      @if(canUpload() && !canChange()) {
        <!-- member upload into an upload-enabled folder: label→input (Safari-compatible, same
             pattern as the c-docs addFiles menu item) -->
        <ion-buttons slot="end">
          <label for="doc-files-input" style="cursor:pointer;display:flex;align-items:center;padding:0 12px;">
            <ion-icon src="{{ 'upload' | svgIcon }}" style="font-size:24px;" color="primary" />
          </label>
        </ion-buttons>
      }
      @if(contextMenuName() !== 'disable') {
        <ion-buttons slot="end">
          <!-- list/grid view toggle — available to every viewer, left of the context menu -->
          <ion-button (click)="toggleView()">
            <ion-icon slot="icon-only" src="{{ viewIcon() | svgIcon }}" />
          </ion-button>
          @if(canChange()) {
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()" [toggleStates]="{ toggleFilter: showFilter(), toggleEditMode: editMode() }"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          }
        </ion-buttons>
      }
    </ion-toolbar>

    <!-- search and filters — always visible from md up; on smaller screens hidden by default
         and toggled via the context-menu 'toggleFilter' action -->
    <okr-list-filter [class.ion-hide-sm-down]="!showFilter()"
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
    />

    <!-- list header -->
    @if(isListView()) {
      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="8" class="clickable" (click)="setSort('title')">
              <ion-label><strong>{{ store.i18n.name() }}{{ sortIcon('title') }}</strong></ion-label>
            </ion-col>
            <ion-col size="2" class="clickable" (click)="setSort('size')">
              <ion-label><strong>{{ store.i18n.size() }}{{ sortIcon('size') }}</strong></ion-label>
            </ion-col>
            <ion-col size="2" class="clickable" (click)="setSort('dateOfDocLastUpdate')">
              <ion-label><strong>{{ store.i18n.lastUpdate() }}{{ sortIcon('dateOfDocLastUpdate') }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    }
  </ion-header>

<!-- list data -->
<ion-content #content [class.dropzone]="dropUpload()"
  (dragover)="onContentDragOver($event)" (dragleave)="dropUpload.set(false)" (drop)="onContentDrop($event)">
  @if(isLoading()) {
    <okr-spinner />
  } @else {
    @if (isEmpty()) {
      <okr-empty-list [message]="store.i18n.empty()" />
    } @else {
      @if(isListView() === true) {
        <ion-grid>
          <!-- subfolders -->
          @for(folder of subFolders(); track folder.okey) {
            <ion-row (click)="showFolderActions(folder)"
              [class.droptarget]="dropFolderKey() === folder.okey"
              (dragover)="onFolderDragOver($event, folder)" (dragleave)="dropFolderKey.set(undefined)"
              (drop)="onFolderDrop($event, folder)">
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    <ion-icon style="width: 100%; height: 100%;" src="{{ 'folder' | svgIcon }}" />
                  </ion-thumbnail>
                  <ion-label>
                    <h3>{{ folder.title || folder.name }}</h3>
                    <p>{{ folderDocumentCounts().get(folder.okey) ?? 0 }} {{ store.i18n.file_count() }}</p>
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
          <!-- don't use 'document' here as it leads to confusions with HTML document -->
          @for(doc of sortedDocuments(); track doc.okey) {
            <ion-row (click)="showActions(doc)" draggable="true"
              (dragstart)="onDragStart($event, doc)" (dragend)="onDragEnd()">
              <ion-col size="12" size-sm="8">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    @if(doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') {
                      <!-- draggable=false: a native image drag would hijack the row's move drag -->
                      <img src="{{ doc.fullPath | thumbnailUrl}}" [alt]="doc.altText" draggable="false" />
                    } @else {
                      <ion-icon style="width: 100%; height: 100%;" src="{{ doc.fullPath | fileLogo }}" />
                    }
                  </ion-thumbnail>
                  <ion-label>
                    <h3>{{ doc.title }}</h3>
                    <p>{{ doc.fullPath | fileName}}</p>
                  </ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="2" class="ion-hide-sm-down" style="font-size:0.8rem;">
                <ion-item lines="none">
                  <ion-label style="font-size:0.8rem;">{{ doc.size | fileSize}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="2" class="ion-hide-sm-down" style="font-size:0.8rem;">
                <ion-item lines="none">
                  <ion-label style="font-size:0.8rem;">{{ doc.dateOfDocLastUpdate | prettyDate }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      } @else {
        <ion-grid>
          <ion-row>
            <!-- subfolders -->
            @for(folder of subFolders(); track folder.okey) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="showFolderActions(folder)"
                [class.droptarget]="dropFolderKey() === folder.okey"
                (dragover)="onFolderDragOver($event, folder)" (dragleave)="dropFolderKey.set(undefined)"
                (drop)="onFolderDrop($event, folder)">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px; background: var(--ion-color-light);">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    <ion-icon style="width: 60%; height: 60%; margin: 20%;" src="{{ 'folder' | svgIcon }}" />
                  </ion-thumbnail>
                </div>
                <p style="font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ folder.title || folder.name }} ({{ folderDocumentCounts().get(folder.okey) ?? 0 }})</p>
              </ion-col>
            }
            <!-- documents -->
            @for(doc of sortedDocuments(); track doc.okey) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="showActions(doc)" draggable="true"
                (dragstart)="onDragStart($event, doc)" (dragend)="onDragEnd()">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px;">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    @if(doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') {
                      <!-- draggable=false: a native image drag would hijack the row's move drag -->
                      <img src="{{ doc.fullPath | thumbnailUrl}}" [alt]="doc.altText" draggable="false" />
                    } @else {
                      <ion-icon style="width: 100%; height: 100%;" src="{{ doc.fullPath | fileLogo }}" />
                    }
                  </ion-thumbnail>
                </div>
                <p style="font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{doc.fullPath | fileName}}</p>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      }
    }
  }
</ion-content>
`
})
export class DocumentList {
  protected readonly store = inject(DocumentStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly listId = input.required<string>();  // preset filter, e.g. p:path (with wildcard), t:tag, k:parentKey
  public readonly contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'list' | 'grid'>('grid'); // initial view mode
  // keepDefaultTrue: withComponentInputBinding() would otherwise set this to undefined on standalone
  public showMenuButton = input(true, { transform: keepDefaultTrue });
  public groupAdmin = input(false);
  /**
   * The group whose files segment this list renders ('' outside a GroupView). Needed so a
   * group admin's delete can be routed through the `deleteGroupContent` Cloud Function —
   * firestore.rules cannot grant deletion on group admin-ship alone.
   */
  public groupKey = input('');

  // filters
  protected readonly searchTerm = linkedSignal(() => this.store.searchTerm());
  protected readonly selectedTag = linkedSignal(() => this.store.selectedTag());
  protected readonly selectedType = linkedSignal(() => this.store.selectedType());

  // data
  protected documentsCount = computed(() => this.store.documentsCount());
  protected filteredDocuments = computed(() => this.store.filteredDocuments() ?? []);
  protected filteredDocumentsCount = computed(() => this.filteredDocuments().length);
  // sorting (list view header); grid view follows the same order
  protected readonly sortKey = signal<DocumentSortField>('title');
  protected readonly sortAsc = signal(true);
  protected readonly sortedDocuments = computed(() => {
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;
    return [...this.filteredDocuments()].sort((a, b) => dir * (key === 'size'
      ? (a.size ?? 0) - (b.size ?? 0)
      : String(a[key] ?? '').localeCompare(String(b[key] ?? ''))));
  });
  protected subFolders = computed(() => this.store.subFolders());
  protected folderDocumentCounts = computed(() => this.store.folderDocumentCounts());
  protected isLoading = computed(() => this.store.isLoading());
  protected isEmpty = computed(() => this.filteredDocumentsCount() === 0 && this.subFolders().length === 0);
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('document_type'));
  protected sources = computed(() => this.store.appStore.getCategory('document_source'));
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  public isListView = linkedSignal(() => this.view() === 'list');
  // filter row hidden by default; toggled via the context-menu 'toggleFilter' action
  protected readonly showFilter = signal(false);
  // read-only by default: tapping a folder navigates into it, tapping a file opens the viewer overlay.
  // The context-menu 'toggleEditMode' action flips this to show the per-item action sheets.
  protected readonly editMode = signal(false);
  // list view → show the 'grid' icon (switch to grid); grid view → show the 'list' icon
  protected readonly viewIcon = computed(() => this.isListView() ? 'grid' : 'list');
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()) && !this.groupAdmin());
  protected readonly currentFolder = computed(() => this.store.currentFolder());
  protected readonly canUpload = computed(() => canUploadToFolder(this.currentFolder(), this.currentUser(), this.groupAdmin()));
  protected popupId = computed(() => `c_docs_${this.listId}`);
  protected readonly folderKey = computed(() => this.getFolderName(this.store.listId()));

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setListId(this.listId()));
    effect(() => this.store.setGroupKey(this.groupKey()));
  }

  /******************************** setters (filter) ******************************************* */
  protected onFolderSelected(key: string): void {
    this.store.setListId(`f:${key}`);
  }

  protected onSubfolderClick(key: string): void {
    this.store.setListId(`f:${key}`);
  }

  protected setSort(key: DocumentSortField): void {
    this.sortAsc.set(this.sortKey() === key ? !this.sortAsc() : true);
    this.sortKey.set(key);
  }

  protected sortIcon(key: DocumentSortField): string {
    if (this.sortKey() !== key) return '';
    return this.sortAsc() ? ' ↑' : ' ↓';
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.store.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.store.setSelectedType(type);
  }

  protected readonly acceptMimeTypes = DEFAULT_MIMETYPES.join(',');

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.store.addFiles(files);
  }

  /******************************* drag & drop *************************************** */
  /** The document currently being dragged (in-app move), if any. */
  protected readonly dragged = signal<DocumentModel | undefined>(undefined);
  /** Folder currently hovered by a drag, for the drop highlight. */
  protected readonly dropFolderKey = signal<string | undefined>(undefined);
  /** External files hovering over the list, for the upload highlight. */
  protected readonly dropUpload = signal(false);

  protected onDragStart(event: DragEvent, doc: DocumentModel): void {
    if (!canEditDocument(doc, this.currentFolder(), this.currentUser(), this.groupAdmin())) {
      event.preventDefault();
      return;
    }
    this.dragged.set(doc);
    event.dataTransfer?.setData('text/plain', doc.okey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onDragEnd(): void {
    this.dragged.set(undefined);
    this.dropFolderKey.set(undefined);
  }

  protected onFolderDragOver(event: DragEvent, folder: FolderModel): void {
    if (!this.dragged()) return; // external file drops fall through to the content handler
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropFolderKey.set(folder.okey);
  }

  protected async onFolderDrop(event: DragEvent, folder: FolderModel): Promise<void> {
    const doc = this.dragged();
    if (!doc) return;
    event.preventDefault();
    event.stopPropagation(); // don't let the content handler treat this as an upload
    this.onDragEnd();
    await this.store.moveToFolder(doc, folder.okey);
  }

  protected onContentDragOver(event: DragEvent): void {
    if (!this.canUpload() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dropUpload.set(true);
  }

  protected async onContentDrop(event: DragEvent): Promise<void> {
    this.dropUpload.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length || !this.canUpload()) return;
    event.preventDefault();
    await this.store.addFiles(files);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch(selectedMethod) {
      case 'add':  await this.store.add(); break;
      case 'addFiles': break; // handled by the toolbar label→input (Safari-compatible)
      case 'addFolder': await this.store.addFolder(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      case 'toggleFilter': this.showFilter.update(v => !v); break;
      case 'toggleEditMode': this.editMode.update(v => !v); break;
      default: error(undefined, `DocumentList.call: unknown method ${selectedMethod}`);
    }
  }

/**
   * Displays an ActionSheet with all possible actions on a Document. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param document 
   */
  protected async showActions(document: DocumentModel): Promise<void> {
    if (!this.editMode()) {
      await this.openViewer(document);
      return;
    }
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, document);
    await this.executeActions(actionSheetOptions, document);
  }

  /**
   * Read-only tap on a file: show it in the same full-screen overlay the article section uses
   * (prev/next across the sibling images of this folder, download). Non-image files (pdf, office,
   * …) have no image rendering — open them in the browser instead.
   */
  private async openViewer(document: DocumentModel): Promise<void> {
    if (!document.mimeType.startsWith('image/')) {
      await this.store.preview(document, false);
      return;
    }
    const gallery = this.galleryImages();
    const startIndex = Math.max(0, gallery.findIndex((img) => img.documentKey === document.okey));
    await showZoomedImage(this.modalController, document.fullPath, document.title, IMAGE_STYLE_SHAPE,
      document.altText, 'full-modal', gallery, startIndex);
  }

  /** Every image of the current (filtered) list, in display order — the viewer's prev/next range. */
  private galleryImages(): ImageConfig[] {
    return this.sortedDocuments()
      .filter((doc) => doc.mimeType.startsWith('image/'))
      .map((doc) => ({ ...IMAGE_CONFIG_SHAPE, label: doc.title, url: doc.fullPath, altText: doc.altText, documentKey: doc.okey }));
  }

  /** Folder tap: outside edit mode (or for plain members) navigate straight in; folder managers get an action sheet. */
  protected async showFolderActions(folder: FolderModel): Promise<void> {
    if (!this.editMode() || !canEditFolder(folder, this.currentUser(), this.groupAdmin())) {
      this.onSubfolderClick(folder.okey);
      return;
    }
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    actionSheetOptions.buttons.push(createActionSheetButton('folder.open', this.store.i18n.folder_open(), this.imgixBaseUrl, 'folder'));
    actionSheetOptions.buttons.push(createActionSheetButton('folder.edit', this.store.i18n.folder_edit(), this.imgixBaseUrl, 'edit'));
    actionSheetOptions.buttons.push(createActionSheetButton('folder.delete', this.store.i18n.folder_delete(), this.imgixBaseUrl, 'trash'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    const actionSheet = await this.actionSheetController.create(actionSheetOptions);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'folder.open': this.onSubfolderClick(folder.okey); break;
      case 'folder.edit': await this.store.editFolder(folder); break;
      case 'folder.delete': await this.store.deleteFolder(folder); break;
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param document
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, document: DocumentModel): void {
    const folder = this.currentFolder();
    if (canEditDocument(document, folder, this.currentUser(), this.groupAdmin())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.update', this.store.i18n.upload_new(), this.imgixBaseUrl, 'upload'));
      // raster → SVG is the only conversion offered today, so only JPG/PNG can be vectorized
      if (VECTORIZABLE_MIME_TYPES.includes(document.mimeType)) {
        actionSheetOptions.buttons.push(createActionSheetButton('document.vectorize', this.store.i18n.vectorize(), this.imgixBaseUrl, 'image'));
      }
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('document.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('document.download', this.store.i18n.download(), this.imgixBaseUrl, 'download'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.share', this.store.i18n.share(), this.imgixBaseUrl, 'share'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.showRevisions', this.store.i18n.revisions(), this.imgixBaseUrl, 'timeline'));
    if (canDeleteDocument(document, folder, this.currentUser(), this.groupAdmin())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions
   * @param document
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, document: DocumentModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'document.delete':
          await this.store.delete(document, !canDeleteDocument(document, this.currentFolder(), this.currentUser(), this.groupAdmin()));
          break;
        case 'document.download':
          await this.store.download(document, false); // download is a read operation — available to every viewer
          break;
        case 'document.share':
          await this.store.share(document);
          break;
        case 'document.update':
          await this.store.update(document, !canEditDocument(document, this.currentFolder(), this.currentUser(), this.groupAdmin()));
          break;
        case 'document.edit':
          await this.store.edit(document, !canEditDocument(document, this.currentFolder(), this.currentUser(), this.groupAdmin()));
          break;
        case 'document.view':
          await this.store.edit(document, true);
          break;
        case 'document.preview':
          await this.store.preview(document, true);
          break;
        case 'document.showRevisions':
          await this.store.showRevisions(document);
          break;
        case 'document.vectorize':
          await this.store.vectorize(document, !canEditDocument(document, this.currentFolder(), this.currentUser(), this.groupAdmin()));
          break;
      }
    }
  }

  /** Flip between list and grid view. Public so a parent toolbar (group view) can drive the hoisted toggle. */
  public toggleView(): void {
    this.isListView.set(!this.isListView());
  }

  /** Whether the filter row is currently visible. Public so a parent (group view) can reflect it in a hoisted toggle menu item. */
  public isFilterVisible(): boolean {
    return this.showFilter();
  }

  /** Whether edit mode is on. Public so a parent (group view) can reflect it in a hoisted toggle menu item. */
  public isEditMode(): boolean {
    return this.editMode();
  }

  /******************************* helpers *************************************** */
  public canChange(): boolean {
    return !this.readOnly();
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  private getFolderName(listId: string): string | undefined {
    if (listId.startsWith('f:')) return listId.substring(2);
    return undefined;
  }
}



