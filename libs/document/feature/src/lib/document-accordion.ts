import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel } from '@bk2/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, Spinner } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { DocumentStore } from './document.store';

@Component({
  selector: 'bk-documents-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, FileLogoPipe, PrettyDatePipe, FileSizePipe, SvgIconPipe, FileNamePipe,
    Spinner, EmptyList,
    IonItem, IonLabel, IonButton, IonIcon, IonList, IonAccordion
  ],
  providers: [DocumentStore],
  styles: [`
    .info { font-size: 0.6rem; }
    .fileName { font-size: 0.9rem; }
    `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="documents">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(!isReadOnly()) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
      @if((documents()); as documents) {
        @if(documents.length === 0) {
          <bk-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list lines="none">
            @for(document of documents; track document.bkey) {
              <ion-item (click)="showActions(document)">
                <ion-icon src="{{ document.fullPath | fileLogo }}"></ion-icon>&nbsp;
                <ion-label>
                  <span class="info">{{ document.dateOfDocCreation | prettyDate }} / {{ document.size | fileSize }}</span>
                  <p class="fileName">{{ document.fullPath | fileName }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      } @else {
        <bk-spinner />
      }
    </div>
  </ion-accordion>
  `,
})
export class DocumentsAccordion {
  protected readonly store = inject(DocumentStore);
  private actionSheetController = inject(ActionSheetController);

  public parentKey = input.required<string>();
  public readonly color = input('light');
  public readonly title = input(this.store.i18n.documents());
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly documents = computed(() => this.store.filteredDocuments() ?? []);

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.store.setListId(`f:${this.parentKey()}`);
    });
  }

  protected async add(): Promise<void> {
   await this.store.add(this.parentKey());
  } 

  /**
   * Displays an ActionSheet with all possible actions on a Document. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param document 
   */
  protected async showActions(document: DocumentModel): Promise<void> {
    if (this.readOnly()) {
      await this.store.download(document, false);
    } else {
      const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
      this.addActionSheetButtons(actionSheetOptions, document);
      await this.executeActions(actionSheetOptions, document);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   * readOnly is always false
   * @param document 
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, document: DocumentModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('document.download', this.store.i18n.download(), this.imgixBaseUrl, 'download'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.update', this.store.i18n.upload_new(), this.imgixBaseUrl, 'upload'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.showRevisions', this.store.i18n.revisions(), this.imgixBaseUrl, 'timeline'));
    actionSheetOptions.buttons.push(createActionSheetButton('document.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
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
          await this.store.download(document, false);
          break;
        case 'document.update':
          await this.store.update(document, this.readOnly());
          break;
        case 'document.edit':
          await this.store.edit(document, this.readOnly());
          break;
        case 'document.showRevisions':
          const revisions = await this.store.getRevisions(document);
          for (const rev of revisions) {
            console.log(` - revision: ${rev.bkey} / version: ${rev.version} / last update: ${rev.dateOfDocLastUpdate}`);
          }
          break;
      }
    }
  }
}
