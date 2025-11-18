import { Component, computed, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonNote, IonRow } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { HorizontalPositions } from '@bk2/shared-categories';
import { LowercaseWordMask, SizeMask } from '@bk2/shared-config';
import { HorizontalPosition, newButton, newIcon } from '@bk2/shared-models';
import { CategoryComponent, EditorComponent } from '@bk2/shared-ui';

import { SectionFormModel } from '@bk2/cms-section-util';

import { ButtonActionConfigComponent } from './button-action-config.component';
import { ButtonFormComponent } from './button.form';
import { IconFormComponent } from './icon.form';

@Component({
  selector: 'bk-button-section-config',
  standalone: true,
  viewProviders: [vestFormsViewProviders],
  imports: [
    IonRow, IonCol, IonNote, IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    EditorComponent, CategoryComponent, ButtonFormComponent, IconFormComponent, ButtonActionConfigComponent
],
  template: `
    @if(vm(); as vm) {
      <bk-button-form [button]="button()" />
      <bk-button-action-config [vm]="vm" />
      <bk-icon-form [icon]="icon()" />
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Begleittext</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-note>
                Hier kannst du einen optionalen Begleittext eingeben, der mit dem Button zusammen dargestellt wird.
                Beispielsweise kann bei einem Download-Button beschrieben werden, was heruntergeladen wird (Dateiname, Grösse etc.).
                Mit der Einstellung 'Position des Buttons' bestimmst du, ob der Button links/rechts oder oben/unten vom Text angezeigt wird.
              </ion-note>
              <bk-cat name="buttonPosition" [(value)]="position" [readOnly]="readOnly()" [categories]="positions" />
              <bk-editor [(content)]="htmlContent" [readOnly]="readOnly()" />
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
    }
  `
})
export class ButtonSectionConfigComponent {
  public vm = model.required<SectionFormModel>();
  public readonly readOnly = input(true);

  public button = computed(() => this.vm().properties?.button ?? newButton());
  public icon = computed(() => this.vm().properties?.icon ?? newIcon());
  protected position = linkedSignal(() => this.vm().properties?.button?.position ?? HorizontalPosition.Left);
  protected htmlContent = linkedSignal(() => this.vm().properties?.button?.htmlContent ?? '<p></p>');

  protected wordMask = LowercaseWordMask;
  protected sizeMask = SizeMask;
  protected positions = HorizontalPositions;
}
