import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { DocumentModel } from '@bk2/shared-models';
import { FileNamePipe, PrettyDatePipe } from '@bk2/shared-pipes';
import { Header } from '@bk2/shared-ui';

import { DocumentStore } from './document.store';

@Component({
  selector: 'bk-document-revisions-modal',
  standalone: true,
  imports: [
    FileNamePipe, PrettyDatePipe,
    Header,
    IonContent, IonList, IonItem, IonLabel
  ],
  providers: [DocumentStore],
  template: `
    <bk-header [i18n]="{ title: 'store.i18n.revisions()' }" [isModal]="true" />
    <ion-content>
      <ion-list>
        @for (doc of revisions(); track doc.bkey) {
          <ion-item>
            <ion-label>
              <h3>{{ doc.version }}</h3>
              <p>{{ doc.fullPath | fileName }} · {{ doc.dateOfDocLastUpdate | prettyDate }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `
})
export class DocumentRevisionsModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(DocumentStore);

  public revisions = input.required<DocumentModel[]>();

  public async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
