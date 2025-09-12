import { AsyncPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { IonAccordion, IonButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { DocumentModel, RoleName } from '@bk2/shared-models';
import { FileLogoPipe, FileNamePipe, FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, SpinnerComponent, UploadService } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-documents-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, FileLogoPipe, PrettyDatePipe, FileSizePipe, SvgIconPipe, FileNamePipe,
    SpinnerComponent, EmptyListComponent,
    IonItem, IonLabel, IonButton, IonIcon, IonList,
    IonItemSliding, IonItemOptions, IonItemOption, IonAccordion
  ],
  template: `
  <ion-accordion toggle-icon-slot="start" value="documents">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('contentAdmin')) {
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
              <ion-item-sliding #slidingItem>
                <ion-item (click)="showDocument(document.url)">
                  <ion-icon src="{{ document.fullPath | fileLogo }}"></ion-icon>&nbsp;
                  <ion-label>{{ document.fullPath | fileName }}</ion-label>
                  <ion-label class="ion-hide-md-down">{{ document.dateOfDocCreation | prettyDate }} / {{ document.size | fileSize }}</ion-label>
                </ion-item>
                @if(hasRole('contentAdmin')) {
                  <ion-item-options side="end">
                    <ion-item-option color="danger" (click)="delete(slidingItem, document)"><ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" /></ion-item-option>
                    <ion-item-option color="primary" (click)="edit(slidingItem, document)"><ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" /></ion-item-option>
                  </ion-item-options>
                }
              </ion-item-sliding>
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

  public documents = input.required<DocumentModel[]>();
  public path = input.required<string>();
  public color = input('primary');
  public title = input('@document.plural');

   /**
   * Show a modal to upload a file.
   */
  public async upload(): Promise<void> {
    const _file = await this.uploadService.pickFile([
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
    if (_file) {
        await this.uploadService.uploadFile(_file, this.path(), '@document.operation.upload.single.title');
    }
  }

  public async showDocument(url: string): Promise<void> {
    await Browser.open({ url: url, windowName: '_blank' });
  }

  protected async edit(slidingItem?: IonItemSliding, document?: DocumentModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    console.log('editDocument', document);
    // tbd: modal to edit the document
  }

  protected async delete(slidingItem?: IonItemSliding, document?: DocumentModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    console.log('deleteDocument', document);
   // this.documentService.delete(document);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
