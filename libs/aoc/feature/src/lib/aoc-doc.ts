import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonThumbnail } from '@ionic/angular/standalone';

import { Button, Header } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { fileSizeUnit } from '@bk2/shared-util-core';
import { FileLogoPipe, ThumbnailUrlPipe } from '@bk2/shared-pipes';
import { I18nService } from '@bk2/shared-i18n';

import { AocDocStore, StorageFileInfo } from './aoc-doc.store';
import { PFX } from './scope';

@Component({
  selector: 'bk-aoc-doc',
  standalone: true,
  imports: [
    ThumbnailUrlPipe, FileLogoPipe,
    Button, Header,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonNote, IonIcon, IonThumbnail
  ],
  providers: [AocDocStore],
  template: `
    <bk-header [title]="i18n.title()" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ i18n.content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Check Files in Store -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n.check_files_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ i18n.check_files_content() }}</ion-col>
              <ion-col size="6">
                <bk-button
                  [label]="missingDocs().length > 0 ? i18n.hide() : i18n.check_files_button()"
                  iconName="checkbox-circle"
                  [disabled]="isChecking()"
                  (click)="toggleCheckFiles()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(missingDocs().length > 0) {
            <ion-list lines="inset">
              @for(doc of missingDocs(); track doc.fullPath) {
                <ion-item (click)="showFileActions(doc)" button>
                  <ion-thumbnail slot="start">
                    @if(isImageOrPdf(doc)) {
                      <img src="{{ doc.fullPath | thumbnailUrl}}" />
                    } @else {
                      <ion-icon style="width: 100%; height: 100%;" src="{{ doc.fullPath | fileLogo }}" />
                    }
                  </ion-thumbnail>
                  <ion-label>
                    <h3>{{ fileName(doc.fullPath) }}</h3>
                    <p>{{ doc.fullPath }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ fileSize(doc.size) }}</ion-note>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocDoc {
  protected readonly store = inject(AocDocStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly i18nService = inject(I18nService);

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    title: PFX + 'doc.title',
    content: PFX + 'doc.content',
    hide: PFX + 'doc.hide',
    check_files_title: PFX + 'doc.checkFiles.title',
    check_files_content: PFX + 'doc.checkFiles.content',
    check_files_button: PFX + 'doc.checkFiles.button',
    as_title: PFX + 'doc.actionsheet.title',
    as_doc_download: PFX + 'doc.actionsheet.document.download',
    as_doc_create: PFX + 'doc.actionsheet.document.create',
    as_doc_delete: PFX + 'doc.actionsheet.document.delete',
    as_copy_path: PFX + 'doc.actionsheet.copy.path',
    as_copy_url: PFX + 'doc.actionsheet.copy.url',
    cancel: '@cancel'
  });

  // computed
  protected readonly missingDocs = computed(() => this.store.missingDocs());
  protected readonly isChecking = computed(() => this.store.isChecking());

  // constants
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected fileName(fullPath: string): string {
    return fullPath.split('/').pop() ?? fullPath;
  }

  protected fileSize(bytes: number): string {
    return fileSizeUnit(bytes);
  }

  public toggleCheckFiles(): void {
    if (this.missingDocs().length > 0) {
      this.store.clearMissingDocs();
    } else {
      this.store.checkFilesInStore();
    }
  }

  protected isImageOrPdf(doc: StorageFileInfo): boolean {
    return (doc.contentType.startsWith('image/') || doc.contentType === 'application/pdf');
  }

  protected async showFileActions(file: StorageFileInfo): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions(this.i18n.as_title());
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.download', this.i18n.as_doc_download(), this.imgixBaseUrl, 'download'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.create', this.i18n.as_doc_create(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.copy.path', this.i18n.as_copy_path(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.copy.url', this.i18n.as_copy_url(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.delete', this.i18n.as_doc_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'doc.actionsheet.document.download':
        await this.store.downloadDocument(file);
        break;
      case 'doc.actionsheet.document.create':
        await this.store.createDbEntry(file);
        break;
      case 'doc.actionsheet.copy.path':
        await this.store.copyStoragePath(file);
        break;
      case 'doc.actionsheet.copy.url':
        await this.store.copyDownloadUrl(file);
        break;
      case 'doc.actionsheet.document.delete':
        await this.store.deleteDocument(file);
        break;
    }
  }
}
