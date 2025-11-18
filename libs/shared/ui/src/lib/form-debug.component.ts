import { Component, computed, input } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { Suite } from 'vest';

import { BkFormModel } from '@bk2/shared-models';
import { PrettyjsonPipe } from '@bk2/shared-pipes';
import { coerceBoolean } from 'libs/shared/util-core/src/lib/type.util';

@Component({
  selector: 'bk-form-debug',
  standalone: true,
  imports: [
    PrettyjsonPipe,
    IonRow, IonGrid, IonCol, IonButton
  ],
  template: `
    <ion-grid>
      @if(shouldShowDebugInfo()) {
      <ion-row>
        <ion-col>
          <small>formValue on form level:</small>
        </ion-col>
      </ion-row>      
      <ion-row>
        <ion-col><small>valid:</small></ion-col>
        <ion-col><small>{{ isFormValid() }}</small></ion-col>
      </ion-row>
      <ion-row>
        <ion-col><small>dirty:</small></ion-col>
        <ion-col><small>{{ isFormDirty() }}</small></ion-col>
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
  protected isFormValid = computed(() => coerceBoolean(this.formValid()));
  public formDirty = input(false);
  protected isFormDirty = computed(() => coerceBoolean(this.formDirty()));
  public formValue = input<BkFormModel>({});
  public showDebugInfo = input(false);
  protected shouldShowDebugInfo = computed(() => coerceBoolean(this.showDebugInfo()));
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
