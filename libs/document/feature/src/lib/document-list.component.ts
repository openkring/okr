import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { bkTranslate, TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel, DocumentModelName, RoleName } from '@bk2/shared-models';
import { FileExtensionPipe, FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getItemLabel, hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { DocumentListStore } from './document-list.store';

@Component({
  selector: 'bk-document-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, FileNamePipe, FileLogoPipe, FileSizePipe, PrettyDatePipe,
    SpinnerComponent, ListFilterComponent,
    EmptyListComponent, MenuComponent,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonPopover
  ],
  providers: [DocumentListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
  <ion-toolbar color="secondary">
    <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    <ion-title>{{ filteredDocumentsCount()}}/{{documentsCount()}} {{ '@document.plural' | translate | async }}</ion-title>
    @if(hasRole('privileged') || hasRole('contentAdmin')) {
      <ion-buttons slot="end">
        <ion-button id="c-docs">
          <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
        </ion-button>
        <ion-popover trigger="c-docs" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
          <ng-template>
            <ion-content>
              <bk-menu [menuName]="contextMenuName()"/>
            </ion-content>
          </ng-template>
        </ion-popover>
      </ion-buttons>
    }
  </ion-toolbar>

  <!-- search and filters -->
  <bk-list-filter 
    [tags]="tags()" (tagChanged)="onTagSelected($event)"
    [type]="types()" (typeChanged)="onTypeSelected($event)"
    (searchTermChanged)="onSearchtermChange($event)"
  />

  <!-- list header -->
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
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(isLoading()) {
    <bk-spinner />
  } @else {
    @if (filteredDocumentsCount() === 0) {
      <bk-empty-list message="@content.page.field.empty" />
    } @else {
      <ion-grid>
        <!-- don't use 'document' here as it leads to confusions with HTML document -->
        @for(doc of filteredDocuments(); track $index) {
          <ion-row (click)="showActions(doc)">
            <ion-col size="12" size-sm="8">
              <ion-item lines="none">
                <ion-icon src="{{ doc.fullPath | fileLogo }}" />&nbsp;
                <ion-label>{{ doc.fullPath | fileName}}</ion-label>
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
    }
  }
</ion-content>
`
})
export class DocumentListComponent {
  protected readonly documentListStore = inject(DocumentListStore);
  private readonly actionSheetController = inject(ActionSheetController);

  public readonly listId = input.required<string>();
  public readonly contextMenuName = input.required<string>();

  protected documentsCount = computed(() => this.documentListStore.documentsCount());
  protected filteredDocuments = computed(() => this.documentListStore.filteredDocuments() ?? []);
  protected filteredDocumentsCount = computed(() => this.filteredDocuments().length);
  protected isLoading = computed(() => this.documentListStore.isLoading());
  protected tags = computed(() => this.documentListStore.getTags());
  protected types = computed(() => this.documentListStore.appStore.getCategory('document_type'));
  protected sources = computed(() => this.documentListStore.appStore.getCategory('document_source'));
  protected readonly currentUser = computed(() => this.documentListStore.appStore.currentUser());
  private readOnly = computed(() => !hasRole('contentAdmin', this.currentUser()));

  private imgixBaseUrl = this.documentListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.documentListStore.add(); break;
      case 'exportRaw': await this.documentListStore.export('raw'); break;
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
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    }
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('document.update', this.imgixBaseUrl, 'upload'));
    }
    if (hasRole('admin', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('document.delete', this.imgixBaseUrl, 'trash_delete'));
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
          await this.documentListStore.delete(document, this.readOnly());
          break;
        case 'document.download':
          await this.documentListStore.download(document, this.readOnly());
          break;
        case 'document.update':
          await this.documentListStore.update(document, this.readOnly());
          break;
        case 'document.edit':
          await this.documentListStore.edit(document, this.readOnly());
          break;
        case 'document.view':
          await this.documentListStore.edit(document, true);
          break;
        case 'document.preview':
          await this.documentListStore.preview(document, true);
          break;
        case 'document.showRevisions':
          const revisions = await this.documentListStore.getRevisions(document);
          for (const rev of revisions) {
            console.log(` - revision: ${rev.bkey} / version: ${rev.version} / last update: ${rev.dateOfDocLastUpdate}`);
          }
          break;
      }
    }
  }

  /******************************* filter setters *************************************** */
  public onSearchtermChange(searchTerm: string): void {
    this.documentListStore.setSearchTerm(searchTerm);
  }

  public onTypeSelected(type: string): void {
    this.documentListStore.setSelectedType(type);
  }

  public onTagSelected(selectedTag: string): void {
    this.documentListStore.setSelectedTag(selectedTag);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.documentListStore.currentUser());
  }
}



