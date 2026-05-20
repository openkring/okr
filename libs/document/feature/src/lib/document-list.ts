import { Component, computed, inject, input, linkedSignal, effect } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonThumbnail, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';


import { DocumentModel, RoleName } from '@bk2/shared-models';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';
import { FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe, FileLogoPipe, ThumbnailUrlPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { FolderBreadcrumb } from '@bk2/folder-ui';

import { DocumentStore } from './document.store';

@Component({
  selector: 'bk-document-list',
  standalone: true,
  imports: [
    SvgIconPipe, FileNamePipe, FileLogoPipe, FileSizePipe, PrettyDatePipe, ThumbnailUrlPipe,
    Spinner, ListFilter, EmptyList, Menu, FolderBreadcrumb,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonPopover, IonThumbnail
  ],
  providers: [DocumentStore],
  template: `
  @if(canChange()) {
    <!-- Input outside ALL Ionic web components so Safari's id lookup and
         label activation are not affected by slot/shadow DOM boundaries.
         Off-screen instead of display:none — Safari won't activate a display:none input via label. -->
    <input id="doc-files-input" type="file" multiple
           [accept]="acceptMimeTypes"
           style="position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;"
           (change)="onFilesSelected($event)" />
  }
  <ion-header>
    @if(contextMenuName() !== 'disable') {
      <ion-toolbar [color]="color()">
        @if(showMenuButton() === true) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ filteredDocumentsCount()}}/{{documentsCount()}} {{ store.i18n.documents() }}</ion-title>
        @if(canChange()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()" [forceVisible]="groupAdmin()" [excludeNames]="['addFiles']"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
    }

    <!-- folder breadcrumb (only when filtered by folder) -->
    @if(folderKey(); as fkey) {
      <bk-folder-breadcrumb [folderKey]="fkey" (folderSelected)="onFolderSelected($event)" />
    }

    <!-- search and filters -->
    <bk-list-filter
      (searchTermChanged)="onSearchtermChange($event)"
      (tagChanged)="onTagSelected($event)" [tags]="tags()"
      (typeChanged)="onTypeSelected($event)" [types]="types()"
      [initialView]="view()" (viewToggleChanged)="onViewChange($event)"
    />

    <!-- list header -->
    @if(isListView()) {
      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="8">
              <ion-label><strong>{{ store.i18n.name() }}</strong></ion-label>
            </ion-col>
            <ion-col size="2">
              <ion-label><strong>{{ store.i18n.size() }}</strong></ion-label>
            </ion-col>
            <ion-col size="2">
              <ion-label><strong>{{ store.i18n.lastUpdate() }}</strong></ion-label>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    }
  </ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if (isEmpty()) {
      <bk-empty-list message="@document.empty" />
    } @else {
      @if(isListView() === true) {
        <ion-grid>
          <!-- subfolders -->
          @for(folder of subFolders(); track folder.bkey) {
            <ion-row (click)="onSubfolderClick(folder.bkey)">
              <ion-col size="12">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    <ion-icon style="width: 100%; height: 100%;" src="{{ 'folder' | svgIcon }}" />
                  </ion-thumbnail>
                  <ion-label>
                    <h3>{{ folder.title || folder.name }}</h3>
                    <p>{{ folderDocumentCounts().get(folder.bkey) ?? 0 }} Dateien</p>
                  </ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
          <!-- don't use 'document' here as it leads to confusions with HTML document -->
          @for(doc of filteredDocuments(); track doc.bkey) {
            <ion-row (click)="showActions(doc)">
              <ion-col size="12" size-sm="8">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    @if(doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') {
                      <img src="{{ doc.fullPath | thumbnailUrl}}" [alt]="doc.altText" />
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
              <ion-col size="2" class="ion-hide-sm-down">
                <ion-item lines="none">
                  <ion-label>{{ doc.size | fileSize}}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="2" class="ion-hide-sm-down">
                <ion-item lines="none">
                  <ion-label>{{ doc.dateOfDocLastUpdate | prettyDate }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      } @else {
        <ion-grid>
          <ion-row>
            <!-- subfolders -->
            @for(folder of subFolders(); track folder.bkey) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="onSubfolderClick(folder.bkey)">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px; background: var(--ion-color-light);">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    <ion-icon style="width: 60%; height: 60%; margin: 20%;" src="{{ 'folder' | svgIcon }}" />
                  </ion-thumbnail>
                </div>
                <p style="font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ folder.title || folder.name }} ({{ folderDocumentCounts().get(folder.bkey) ?? 0 }})</p>
              </ion-col>
            }
            <!-- documents -->
            @for(doc of filteredDocuments(); track doc.bkey) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="showActions(doc)">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px;">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    @if(doc.mimeType.startsWith('image/') || doc.mimeType === 'application/pdf') {
                      <img src="{{ doc.fullPath | thumbnailUrl}}" [alt]="doc.altText" />
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

  // inputs
  public readonly listId = input.required<string>();  // preset filter, e.g. p:path (with wildcard), t:tag, k:parentKey
  public readonly contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'list' | 'grid'>('list'); // initial view mode
  public showMenuButton = input<boolean>(true);
  public groupAdmin = input(false);

  // filters
  protected readonly searchTerm = linkedSignal(() => this.store.searchTerm());
  protected readonly selectedTag = linkedSignal(() => this.store.selectedTag());
  protected readonly selectedType = linkedSignal(() => this.store.selectedType());

  // data
  protected documentsCount = computed(() => this.store.documentsCount());
  protected filteredDocuments = computed(() => this.store.filteredDocuments() ?? []);
  protected filteredDocumentsCount = computed(() => this.filteredDocuments().length);
  protected subFolders = computed(() => this.store.subFolders());
  protected folderDocumentCounts = computed(() => this.store.folderDocumentCounts());
  protected isLoading = computed(() => this.store.isLoading());
  protected isEmpty = computed(() => this.filteredDocumentsCount() === 0 && this.subFolders().length === 0);
  protected tags = computed(() => this.store.getTags());
  protected types = computed(() => this.store.appStore.getCategory('document_type'));
  protected sources = computed(() => this.store.appStore.getCategory('document_source'));
  protected readonly currentUser = computed(() => this.store.appStore.currentUser());
  protected isListView = linkedSignal(() => this.view() === 'list');
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()) && !this.groupAdmin());
  protected popupId = computed(() => `c_docs_${this.listId}`);
  protected readonly folderKey = computed(() => {
    const id = this.store.listId();
    return id.startsWith('f:') ? id.substring(2) : null;
  });

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.store.setListId(this.listId()));
  }

  /******************************** setters (filter) ******************************************* */
  protected onFolderSelected(key: string): void {
    this.store.setListId(`f:${key}`);
  }

  protected onSubfolderClick(key: string): void {
    this.store.setListId(`f:${key}`);
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

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.store.add(); break;
      case 'addFiles': break; // handled by the toolbar label→input (Safari-compatible)
      case 'addFolder': await this.store.addFolder(); break;
      case 'exportRaw': await this.store.export('raw'); break;
      default: error(undefined, `DocumentList.call: unknown method ${selectedMethod}`);
    }
  }

/**
   * Displays an ActionSheet with all possible actions on a Document. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param document 
   */
  protected async showActions(document: DocumentModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, document);
    await this.executeActions(actionSheetOptions, document);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param document 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, document: DocumentModel): void {
    if (this.canChange()) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.update', this.store.i18n.as_update(), this.imgixBaseUrl, 'upload'));
    } else {
      actionSheetOptions.buttons.push(createActionSheetButton('document.view', this.store.i18n.as_view(), this.imgixBaseUrl, 'eye-on'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('document.download', this.store.i18n.as_download(), this.imgixBaseUrl, 'download'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.showRevisions', this.store.i18n.as_revisions(), this.imgixBaseUrl, 'timeline'));
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
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
          await this.store.delete(document, this.readOnly());
          break;
        case 'document.download':
          await this.store.download(document, this.readOnly());
          break;
        case 'document.update':
          await this.store.update(document, this.readOnly());
          break;
        case 'document.edit':
          await this.store.edit(document, this.readOnly());
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
      }
    }
  }

  protected onViewChange(showList: boolean): void {
    this.isListView.set(showList);
  }

  /******************************* helpers *************************************** */
  protected canChange(): boolean {
    return !this.readOnly();
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}



