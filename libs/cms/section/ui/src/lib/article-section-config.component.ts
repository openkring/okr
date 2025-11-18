import { AsyncPipe } from '@angular/common';
import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonRow } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TranslatePipe } from '@bk2/shared-i18n';
import { EditorComponent } from '@bk2/shared-ui';

import { SectionFormModel } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-article-section-config',
  standalone: true,
  viewProviders: [vestFormsViewProviders],
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    EditorComponent
  ],
  template: `
    <ion-row>
      <ion-col size="12">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ '@content.section.forms.article.title' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <bk-editor [(content)]="content" [readOnly]="readOnly()" />
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  `
})
export class ArticleSectionConfigComponent {
  public vm = model.required<SectionFormModel>();
  public readonly readOnly = input(true);
  protected content = linkedSignal(() => this.vm().properties?.content?.htmlContent ?? '<p></p>');
}