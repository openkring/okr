import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, effect } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonThumbnail, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel, RoleName } from '@bk2/shared-models';
import { FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe, FileLogoPipe, ThumbnailUrlPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';
import { FolderBreadcrumbComponent } from '@bk2/folder-ui';

import { DocumentStore } from './document.store';

@Component({
  selector: 'bk-document-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, FileNamePipe, FileLogoPipe, FileSizePipe, PrettyDatePipe, ThumbnailUrlPipe,
    SpinnerComponent, ListFilterComponent,
    EmptyListComponent, MenuComponent, FolderBreadcrumbComponent,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons,
    IonTitle, IonMenuButton, IonContent, IonItem, IonPopover, IonThumbnail
  ],
  providers: [DocumentStore],
  template: `
  <ion-header>
    @if(contextMenuName() !== 'disable') {
      <ion-toolbar [color]="color()">
        @if(showMainMenu() === true) {
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        }
        <ion-title>{{ filteredDocumentsCount()}}/{{documentsCount()}} {{ '@document.plural' | translate | async }}</ion-title>
        @if(!readOnly()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
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
              <ion-label><strong>{{ '@document.list.header.name' | translate | async }}</strong></ion-label>
            </ion-col>
            <ion-col size="2">
              <ion-label><strong>{{ '@document.list.header.size' | translate | async }}</strong></ion-label>
            </ion-col>
            <ion-col size="2">
              <ion-label><strong>{{ '@document.list.header.lastUpdate' | translate | async }}</strong></ion-label>
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
                <p style="font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ folder.title || folder.name }}</p>
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
export class DocumentListComponent {
  protected readonly documentStore = inject(DocumentStore);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public readonly listId = input.required<string>();  // preset filter, e.g. p:path (with wildcard), t:tag, k:parentKey
  public readonly contextMenuName = input.required<string>();
  public color = input('secondary');
  public view = input<'list' | 'grid'>('list'); // initial view mode
  public showMainMenu = input<boolean>(true);

  // filters
  protected readonly searchTerm = linkedSignal(() => this.documentStore.searchTerm());
  protected readonly selectedTag = linkedSignal(() => this.documentStore.selectedTag());
  protected readonly selectedType = linkedSignal(() => this.documentStore.selectedType());

  // data
  protected documentsCount = computed(() => this.documentStore.documentsCount());
  protected filteredDocuments = computed(() => this.documentStore.filteredDocuments() ?? []);
  protected filteredDocumentsCount = computed(() => this.filteredDocuments().length);
  protected subFolders = computed(() => this.documentStore.subFolders());
  protected isLoading = computed(() => this.documentStore.isLoading());
  protected isEmpty = computed(() => this.filteredDocumentsCount() === 0 && this.subFolders().length === 0);
  protected tags = computed(() => this.documentStore.getTags());
  protected types = computed(() => this.documentStore.appStore.getCategory('document_type'));
  protected sources = computed(() => this.documentStore.appStore.getCategory('document_source'));
  protected readonly currentUser = computed(() => this.documentStore.appStore.currentUser());
  protected isListView = linkedSignal(() => this.view() === 'list');
  protected readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()) && !hasRole('privileged', this.currentUser()));
  protected popupId = computed(() => `c_docs_${this.listId}`);
  protected readonly folderKey = computed(() => {
    const id = this.documentStore.listId();
    return id.startsWith('f:') ? id.substring(2) : null;
  });

  private imgixBaseUrl = this.documentStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => this.documentStore.setListId(this.listId()));
  }

  /******************************** setters (filter) ******************************************* */
  protected onFolderSelected(key: string): void {
    this.documentStore.setListId(`f:${key}`);
  }

  protected onSubfolderClick(key: string): void {
    this.documentStore.setListId(`f:${key}`);
  }

  protected onSearchtermChange(searchTerm: string): void {
    this.documentStore.setSearchTerm(searchTerm);
  }

  protected onTagSelected(tag: string): void {
    this.documentStore.setSelectedTag(tag);
  }

  protected onTypeSelected(type: string): void {
    this.documentStore.setSelectedType(type);
  }

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.documentStore.add(); break;
      case 'addFiles': await this.documentStore.addFiles(); break;
      case 'addFolder': await this.documentStore.addFolder(); break;
      case 'exportRaw': await this.documentStore.export('raw'); break;
      default: error(undefined, `DocumentListComponent.call: unknown method ${selectedMethod}`);
    }
  }

/**
   * Displays an ActionSheet with all possible actions on a Document. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param document 
   */
  protected async showActions(document: DocumentModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, document);
    await this.executeActions(actionSheetOptions, document);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * @param document 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, document: DocumentModel): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.preview', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.download', this.imgixBaseUrl, 'download'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.showRevisions', this.imgixBaseUrl, 'timeline'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.update', this.imgixBaseUrl, 'upload'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.delete', this.imgixBaseUrl, 'trash'));
    }
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
          await this.documentStore.delete(document, this.readOnly());
          break;
        case 'document.download':
          await this.documentStore.download(document, this.readOnly());
          break;
        case 'document.update':
          await this.documentStore.update(document, this.readOnly());
          break;
        case 'document.edit':
          await this.documentStore.edit(document, this.readOnly());
          break;
        case 'document.view':
          await this.documentStore.edit(document, true);
          break;
        case 'document.preview':
          await this.documentStore.preview(document, true);
          break;
        case 'document.showRevisions':
          const revisions = await this.documentStore.getRevisions(document);
          for (const rev of revisions) {
            console.log(` - revision: ${rev.bkey} / version: ${rev.version} / last update: ${rev.dateOfDocLastUpdate}`);
          }
          break;
      }
    }
  }

  protected onViewChange(showList: boolean): void {
    this.isListView.set(showList);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.documentStore.currentUser());
  }
}



