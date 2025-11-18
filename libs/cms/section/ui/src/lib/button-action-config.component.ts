import { Component, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { ButtonActions } from '@bk2/shared-categories';
import { ButtonAction } from '@bk2/shared-models';
import { CategoryComponent, TextInputComponent } from '@bk2/shared-ui';

import { SectionFormModel } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-button-action-config',
  standalone: true,
  viewProviders: [vestFormsViewProviders],
  imports: [
    IonGrid, IonRow, IonCol,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle,
    CategoryComponent, TextInputComponent
  ],
  template: `
    <ion-row>
      <ion-col size="12"> 
        <ion-card>
          <ion-card-header>
            <ion-card-title>Action - Konfiguration</ion-card-title>
            <ion-card-subtitle>Definiere was bei einem Klick auf den Button passieren soll.</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <small>
            <div [innerHTML]="description"></div>
            </small>          
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-cat name="buttonAction" [(value)]="buttonAction" [categories]="buttonActions" [readOnly]="readOnly()" (changed)="onChange('buttonAction', $event)" />
                </ion-col>
                @if(buttonAction() !== buttonActionEnum.None) {
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="url" [(value)]="url" [readOnly]="readOnly()" [maxLength]=100 />                             
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  `
})
export class ButtonActionConfigComponent {
  public vm = model.required<SectionFormModel>();
  public readonly readOnly = input(true);

  protected buttonAction = linkedSignal(() => this.vm().properties?.button?.buttonAction ?? ButtonAction.None);
  protected url = linkedSignal(() => this.vm()?.properties?.button?.url ?? '');
  public changed = output<void>(); 

  protected buttonActions = ButtonActions;
  protected buttonActionEnum = ButtonAction;
  protected description = `
  <ul>
  <li><strong>Download:</strong> Der Button startet einen Download der mittels URL referenzierten Datei. Die URL muss auf eine Datei im Firebase Storage zeigen.</li>
  <li><strong>Navigieren:</strong> Der Button navigiert zur angegebenen URL. Die URL muss eine interne Route sein (siehe dazu die MenuItem Konfiguration).</li>
  <li><strong>Browse:</strong> Der Button linkt auf eine externe URL (https://domain.com/path).</li>
  <li><strong>Zoom:</strong> Die in der URL referenzierte Datei wird in einem Zoom-Viewer angezeigt (typischerweise ein Bild). Die URL muss auf eine Datei im Firebase Storage zeigen.</li>
  <li><strong>Keine:</strong> Keine Aktion wird ausgeführt. Die URL wird ignoriert. Dies ist die Default-Einstellung.</li>
  </ul>
  `;

  protected onChange(fieldName: string, $event: boolean | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    this.changed.emit();
  }
}
