import { Component, linkedSignal, model } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { TextInputComponent } from '@bk2/shared/ui';
import { SectionFormModel } from '@bk2/cms/section/util';

@Component({
  selector: 'bk-video-section-form',
  imports: [
    IonRow, IonCol,
    TextInputComponent
  ],
  template: `
    @if(vm(); as vm) {
      <ion-row>
        <ion-col size="12">
          <bk-text-input name="youtubeId" [(value)]="url" [maxLength]=11 [showHelper]=true />                                        
        </ion-col>
      </ion-row>
    }
  `
})
export class VideoSectionFormComponent {
  public vm = model.required<SectionFormModel>();
  protected url = linkedSignal(() => this.vm().properties?.video?.url ?? '');
} 