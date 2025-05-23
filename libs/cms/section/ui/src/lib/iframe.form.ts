import { Component, linkedSignal, model } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonRow } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { TextInputComponent, UrlInputComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { SectionFormModel } from '@bk2/cms/section/util';

@Component({
  selector: 'bk-iframe-section-form',
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    TextInputComponent, UrlInputComponent
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
    <ion-row>
      <ion-col size="12">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ '@content.section.forms.iframe.title' | translate | async}}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <bk-url [(value)]="url" />
            <bk-text-input name="title" [(value)]="title" label="@input.title.label" placeholder="@input.title.placeholder" />
            <bk-text-input name="style" [(value)]="style" label="@input.style.label" placeholder="@input.style.placeholder" [maxLength]=200 helperText="@input.style.helper" />
          </ion-card-content>
        </ion-card>                                                   
      </ion-col>
    </ion-row>
  `
})
export class IframeSectionFormComponent {
  public vm = model.required<SectionFormModel>();
  protected title = linkedSignal(() => this.vm()?.title ?? '');
  protected style = linkedSignal(() => this.vm()?.properties?.iframe?.style ?? 'width: 100%; min-height:400px; border: none;');
  protected url = linkedSignal(() => this.vm()?.properties?.iframe?.url ?? '');
}
