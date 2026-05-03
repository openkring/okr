import { Component, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { DocumentModel } from '@bk2/shared-models';
import { FileNamePipe, PrettyDatePipe } from '@bk2/shared-pipes';
import { HeaderComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-document-revisions-modal',
  standalone: true,
  imports: [
    FileNamePipe, PrettyDatePipe,
    HeaderComponent,
    IonContent, IonList, IonItem, IonLabel
  ],
  template: `
    <bk-header title="@document.revision.list.title" [isModal]="true" />
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

  public revisions = input.required<DocumentModel[]>();

  public async close(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
