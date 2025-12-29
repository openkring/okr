import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel } from '@bk2/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, SpinnerComponent } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

import { DocumentStore } from './document.store';

@Component({
  selector: 'bk-documents-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, FileLogoPipe, PrettyDatePipe, FileSizePipe, SvgIconPipe, FileNamePipe,
    SpinnerComponent, EmptyListComponent,
    IonItem, IonLabel, IonButton, IonIcon, IonList, IonAccordion
  ],
  providers: [DocumentStore],
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
          <bk-empty-list message="@general.noData.documents" />
        } @else {
          <ion-list lines="none">
            @for(document of documents; track document.bkey) {
              <ion-item (click)="showActions(document)">
                <ion-icon src="{{ document.fullPath | fileLogo }}"></ion-icon>&nbsp;
                <ion-label>{{ document.fullPath | fileName }}</ion-label>
                <ion-label class="ion-hide-md-down">{{ document.dateOfDocCreation | prettyDate }} / {{ document.size | fileSize }}</ion-label>
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
export class DocumentsAccordionComponent {
  protected readonly documentStore = inject(DocumentStore);
  private actionSheetController = inject(ActionSheetController);

  public parentKey = input.required<string>();
  public readonly color = input('light');
  public readonly title = input('@document.plural');
  public readonly readOnly = input<boolean>(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly currentUser = computed(() => this.documentStore.currentUser());
  protected readonly documents = computed(() => this.documentStore.documentsOfParent() ?? []);

  private imgixBaseUrl = this.documentStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.documentStore.setParentKey(this.parentKey());
    });
  }

  protected async add(): Promise<void> {
   await this.documentStore.add(this.parentKey());
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
}
