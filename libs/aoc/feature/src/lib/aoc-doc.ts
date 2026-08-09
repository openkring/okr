import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonThumbnail } from '@ionic/angular/standalone';

import { Button, Header } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { fileSizeUnit } from '@okr/shared-util-core';
import { FileLogoPipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';

import { AocDocStore, BULK_CREATE_THRESHOLD, StorageFileInfo } from './aoc-doc.store';

@Component({
  selector: 'okr-aoc-doc',
  standalone: true,
  imports: [
    ThumbnailUrlPipe, FileLogoPipe,
    Button, Header,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonNote, IonIcon, IonThumbnail
  ],
  providers: [AocDocStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.doc_title() }" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ store.i18n.doc_content() }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Check Files in Store -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.doc_check_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ store.i18n.doc_check_content() }}</ion-col>
              <ion-col size="6">
                <okr-button
                  [label]="missingDocs().length > 0 ? store.i18n.doc_hide() : store.i18n.doc_check_button()"
                  iconName="checkbox-circle"
                  [disabled]="isChecking()"
                  (click)="toggleCheckFiles()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(showBulkCreate()) {
            <ion-grid>
              <ion-row>
                <ion-col>
                  <okr-button
                    [label]="bulkCreateLabel()"
                    iconName="add-circle"
                    [disabled]="isCreatingAll()"
                    (click)="store.createAllDbEntries()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          }
          @if(missingDocs().length > 0) {
            <ion-list lines="inset">
              @for(doc of missingDocs(); track doc.fullPath) {
                <ion-item (click)="showFileActions(doc)" button>
                  <!-- The scan returns EVERY object under the tenant prefix, so this list can be
                       hundreds of rows and each thumbnail is a distinct imgix URL. Fetching them
                       all at once gets the burst rate-limited (429) — and the 429 hits whatever
                       is in flight, including the shared filetype logos. Both attributes below
                       defer the request until the row is near the viewport. The logos need no
                       extra cache: ion-icon already dedupes identical srcs process-wide. -->
                  <ion-thumbnail slot="start">
                    @if(isImageOrPdf(doc)) {
                      <img src="{{ doc.fullPath | thumbnailUrl}}" loading="lazy" decoding="async" />
                    } @else {
                      <ion-icon style="width: 100%; height: 100%;" src="{{ doc.fullPath | fileLogo }}" lazy="true" />
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

  // computed
  protected readonly missingDocs = computed(() => this.store.missingDocs());
  protected readonly isChecking = computed(() => this.store.isChecking());
  protected readonly isCreatingAll = computed(() => this.store.isCreatingAll());

  /** Creating one by one via the ActionSheet stops being reasonable past a handful of files. */
  protected readonly showBulkCreate = computed(() => this.missingDocs().length > BULK_CREATE_THRESHOLD);

  /** While the run is going, the button doubles as the progress indicator. */
  protected readonly bulkCreateLabel = computed(() => {
    const total = this.missingDocs().length;
    if (!this.isCreatingAll()) return this.store.i18n.doc_create_all();
    return this.store.i18n.doc_create_all_running()
      .replace('{{done}}', String(this.store.createdCount()))
      .replace('{{count}}', String(total));
  });

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
    const options: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.download', this.store.i18n.doc_download(), this.imgixBaseUrl, 'download'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.create', this.store.i18n.doc_create(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.copy.path', this.store.i18n.doc_copy_path(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.copy.url', this.store.i18n.doc_copy_url(), this.imgixBaseUrl, 'copy'));
    options.buttons.push(createActionSheetButton('doc.actionsheet.document.delete', this.store.i18n.doc_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel-circle'));

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
