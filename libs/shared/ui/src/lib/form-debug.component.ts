import { Component, input } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { Suite } from 'vest';

import { BkFormModel } from '@bk2/shared-models';
import { PrettyjsonPipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-form-debug',
  standalone: true,
  imports: [
    PrettyjsonPipe,
    IonRow, IonGrid, IonCol, IonButton
  ],
  template: `
    <ion-grid>
      @if(showDebugInfo()) {
      <ion-row>
        <ion-col>
          <small>formValue on form level:</small>
        </ion-col>
      </ion-row>      
      <ion-row>
        <ion-col><small>valid:</small></ion-col>
        <ion-col><small>{{ formValid() }}</small></ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>dirty:</small></ion-col>
        <ion-col><small>{{ formDirty() }}</small></ion-col>
      </ion-row>
      <ion-row>
        <ion-col>
          <small><div [innerHTML]="formValue() | prettyjson"></div></small>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col>
          <ion-button type="button" (click)="validate()">Validate</ion-button>
        </ion-col>
      </ion-row>
    }
    </ion-grid>
  `
})
export class FormDebugComponent {
  public formValid = input(false);
  public formDirty = input(false);
  public formValue = input<BkFormModel>({});
  public showDebugInfo = input(false);
  public suite = input<Suite<string, string>>();

  protected validate(): void {
    const _suite = this.suite();
    if (_suite) {
      const _result = _suite(this.formValue, '');
      console.log('FormDebugComponent.validate: hasErrors = ' + _result.hasErrors());
      console.log('                               result    =', _result);  
    }
  }
}
