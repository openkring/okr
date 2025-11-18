import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel, RoleName } from '@bk2/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, SpinnerComponent, UploadService } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-documents-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, FileLogoPipe, PrettyDatePipe, FileSizePipe, SvgIconPipe, FileNamePipe,
    SpinnerComponent, EmptyListComponent,
    IonItem, IonLabel, IonButton, IonIcon, IonList, IonAccordion
  ],
  template: `
  <ion-accordion toggle-icon-slot="start" value="documents">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('contentAdmin') && !readOnly()) {
        <ion-button fill="outline" (click)="upload()">
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
  public appStore = inject(AppStore);
  public modalController = inject(ModalController); 
  private readonly uploadService = inject(UploadService);
  private actionSheetController = inject(ActionSheetController);

  public documents = input.required<DocumentModel[]>();
  public readonly path = input.required<string>();
  public readonly color = input('primary');
  public readonly title = input('@document.plural');
  public readonly readOnly = input(true);


  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

   /**
   * Show a modal to upload a file.
   */
  public async upload(): Promise<void> {
    const file = await this.uploadService.pickFile([
      'image/png', 
      'image/jpg', 
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]);
    if (file) {
        await this.uploadService.uploadFile(file, this.path(), '@document.operation.upload.single.title');
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
    if (hasRole('privileged', this.appStore.currentUser()) || hasRole('eventAdmin', this.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'create_edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('show', this.imgixBaseUrl, 'document'));
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

  public async show(doc: DocumentModel): Promise<void> {
    await Browser.open({ url: doc.url, windowName: '_blank' });
  }

  protected async edit(doc?: DocumentModel): Promise<void> {
    if (!this.readOnly()) {
      console.log('DocumentAccordion.edit is not yet implemented.', document);
      // tbd: modal to edit the document
    }
  }

  protected async delete(doc?: DocumentModel): Promise<void> {
    if (!this.readOnly()) {
      console.log('DocumentAccordion.delete is not yet implemented.', document);
      // this.documentService.delete(document);
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
