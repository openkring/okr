import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { SectionFormModel } from '@bk2/cms-section-util';
import { TextInputComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-video-section-form',
  standalone: true,
  imports: [
    IonRow, IonCol,
    TextInputComponent
  ],
  template: `
    @if(vm(); as vm) {
      <ion-row>
        <ion-col size="12">
          <bk-text-input name="youtubeId" [(value)]="url" [maxLength]=11 [readOnly]="readOnly()" [showHelper]=true />                                        
        </ion-col>
      </ion-row>
    }
  `
})
export class VideoSectionFormComponent {
  public vm = model.required<SectionFormModel>();
  public readonly readOnly = input(true);

  protected url = linkedSignal(() => this.vm().properties?.video?.url ?? '');
} 