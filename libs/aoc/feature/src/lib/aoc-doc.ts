import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, ToastController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ButtonComponent, HeaderComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { fileSizeUnit } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocDocStore, StorageFileInfo } from './aoc-doc.store';

@Component({
  selector: 'bk-aoc-doc',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    ButtonComponent, HeaderComponent,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonNote, IonIcon,
  ],
  providers: [AocDocStore],
  template: `
    <bk-header title="@aoc.doc.title" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.doc.content' | translate | async }}</ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- Check Files in Store -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.doc.checkFiles.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="6">{{ '@aoc.doc.checkFiles.content' | translate | async }}</ion-col>
              <ion-col size="6">
                <bk-button
                  [label]="missingDocs().length > 0 ? 'Ausblenden' : (('@aoc.doc.checkFiles.button' | translate | async) ?? '')"
                  iconName="checkbox-circle"
                  [disabled]="isChecking()"
                  (click)="toggleCheckFiles()" />
              </ion-col>
            </ion-row>
          </ion-grid>
          @if(missingDocs().length > 0) {
            <ion-list lines="inset">
              @for(file of missingDocs(); track file.fullPath) {
                <ion-item (click)="showFileActions(file)" button>
                  <ion-icon slot="start" src="{{ 'document' | svgIcon }}" color="warning" />
                  <ion-label>
                    <h3>{{ fileName(file.fullPath) }}</h3>
                    <p>{{ file.fullPath }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ fileSize(file.size) }}</ion-note>
                </ion-item>
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocDocComponent {
  protected readonly aocDocStore = inject(AocDocStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);

  protected readonly missingDocs = computed(() => this.aocDocStore.missingDocs());
  protected readonly isChecking = computed(() => this.aocDocStore.isChecking());

  protected fileName(fullPath: string): string {
    return fullPath.split('/').pop() ?? fullPath;
  }

  protected fileSize(bytes: number): string {
    return fileSizeUnit(bytes);
  }

  public toggleCheckFiles(): void {
    if (this.missingDocs().length > 0) {
      this.aocDocStore.clearMissingDocs();
    } else {
      this.aocDocStore.checkFilesInStore();
    }
  }

  protected async showFileActions(file: StorageFileInfo): Promise<void> {
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('document.download', ''));
    options.buttons.push(createActionSheetButton('document.create', ''));
    options.buttons.push(createActionSheetButton('copy.path', ''));
    options.buttons.push(createActionSheetButton('copy.url', ''));
    options.buttons.push(createActionSheetButton('document.delete', ''));
    options.buttons.push(createActionSheetButton('cancel', ''));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'document.download':
        await this.aocDocStore.downloadDocument(file);
        break;
      case 'document.create':
        await this.aocDocStore.createDbEntry(file);
        break;
      case 'copy.path':
        await this.aocDocStore.copyStoragePath(file);
        break;
      case 'copy.url':
        await this.aocDocStore.copyDownloadUrl(file);
        break;
      case 'document.delete':
        await this.aocDocStore.deleteDocument(file);
        break;
    }
  }
}
