import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { addAllCategory, DocumentTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel, RoleName } from '@bk2/shared-models';
import { CategoryAbbreviationPipe, FileExtensionPipe, FileLogoPipe, FileNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { MenuComponent } from '@bk2/cms-menu-feature';

import { DocumentListStore } from './document-list.store';

@Component({
  selector: 'bk-document-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, FileNamePipe, FileLogoPipe, FileExtensionPipe,
    SpinnerComponent, ListFilterComponent,
    CategoryAbbreviationPipe, EmptyListComponent, MenuComponent,
    IonToolbar, IonGrid, IonRow, IonCol, IonButton, IonIcon, IonLabel, IonHeader, IonButtons, 
    IonTitle, IonMenuButton, IonContent, IonItem, IonPopover
  ],
  providers: [DocumentListStore],
  template: `
  <ion-header>
    <!-- title and actions -->
  <ion-toolbar color="secondary">
    <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    <ion-title>{{ selectedDocumentsCount()}}/{{documentsCount()}} {{ '@document.plural' | translate | async }}</ion-title>
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
    [tags]="documentTags()"
    [types]="docTypes"
    [typeName]="typeName"
    (searchTermChanged)="onSearchtermChange($event)"
    (tagChanged)="onTagSelected($event)"
    (typeChanged)="onTypeSelected($event)"
  />

  <!-- list header -->
  <ion-toolbar color="primary">
    <ion-grid>
      <ion-row>
        <ion-col size="12" size-sm="8">
          <ion-label color="light"><strong>{{ '@document.list.header.name' | translate | async }}</strong></ion-label>
        </ion-col>
        <ion-col size="2" class="ion-hide-sm-down">
          <ion-label color="light"><strong>{{ '@document.list.header.type' | translate | async }}</strong></ion-label>
        </ion-col>
        <ion-col size="2" class="ion-hide-sm-down">
          <ion-label color="light"><strong>{{ '@document.list.header.extension' | translate | async }}</strong></ion-label>
        </ion-col>
      </ion-row>
    </ion-grid>
  </ion-toolbar>
</ion-header>

<!-- list data -->
<ion-content #content>
  @if(!isLoading()) {
    @if (filteredDocuments.length === 0) {
      <bk-empty-list message="@content.page.field.empty" />
    } @else {
      <ion-grid>
        <!-- don't use 'document' here as it leads to confusions with HTML document -->
        @for(doc of filteredDocuments(); track doc.bkey) {
          <ion-row (click)="showActions(doc)">
            <ion-col size="12" size-sm="8">
              <ion-item lines="none">
                <ion-icon src="{{ doc.fullPath | fileLogo }}" />&nbsp;
                <ion-label>{{ doc.fullPath | fileName }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="2" class="ion-hide-sm-down">
              <ion-item lines="none">
                <ion-label>{{ doc.type ?? 0 | categoryAbbreviation:docTypes }}</ion-label>
              </ion-item>
            </ion-col>
            <ion-col size="2" class="ion-hide-sm-down">
              <ion-item lines="none">
                <ion-label>{{ doc.fullPath | fileExtension }}</ion-label>
              </ion-item>
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    }
  } @else {
    <bk-spinner />
  }
</ion-content>
`
})
export class DocumentAllListComponent {
  protected documentListStore = inject(DocumentListStore);
  private actionSheetController = inject(ActionSheetController);

  public listId = input.required<string>();
  public contextMenuName = input.required<string>();

  protected filteredDocuments = computed(() => this.documentListStore.filteredDocuments() ?? []);
  protected documentsCount = computed(() => this.documentListStore.documentsCount());
  protected selectedDocumentsCount = computed(() => this.filteredDocuments().length);
  protected isLoading = computed(() => this.documentListStore.isLoading());
  protected documentTags = computed(() => this.documentListStore.getTags());

  protected docTypes = addAllCategory(DocumentTypes);
  protected typeName = 'documentType';
  private imgixBaseUrl = this.documentListStore.appStore.env.services.imgixBaseUrl;

  /******************************* actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'add':  await this.documentListStore.add(); break;
      case 'export': await this.documentListStore.export(); break;
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
    if (hasRole('contentAdmin', this.documentListStore.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash_delete'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
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
      switch (data.action) {
        case 'delete':
          await this.delete(document);
          break;
        case 'edit':
          await this.edit(document);
          break;
        case 'show':
          await this.show(document);
          break;
      }
    }
  }

  public async show(document: DocumentModel): Promise<void> {
    await Browser.open({ url: document.url, windowName: '_blank' });
  }

  protected async delete(doc?: DocumentModel): Promise<void> {
    if (doc) await this.documentListStore.delete(doc);
  }

  public async edit(doc?: DocumentModel): Promise<void> {
    if (doc) await this.documentListStore.edit(doc);
  }

  /******************************* change notifications *************************************** */
  public onSearchtermChange(searchTerm: string): void {
    this.documentListStore.setSearchTerm(searchTerm);
  }

  public onTypeSelected(type: number): void {
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



