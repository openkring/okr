import { Component, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { InvitationsConfig } from '@bk2/shared-models';
import { CheckboxComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-invitations-config',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    TextInputComponent, CheckboxComponent, NumberInputComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `  

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ title() | translate | async}}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() | translate | async}}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        @if(intro(); as intro) {
          @if(intro.length > 0) {
            <small><div [innerHTML]="intro"></div></small>
          }
        }        

        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="moreUrl" [value]="moreUrl()" (valueChange)="onFieldChange('moreUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-number-input name="maxItems" [value]="maxItems()" (valueChange)="onFieldChange('maxItems', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showPastItems" [checked]="showPastItems()" (checkedChange)="onFieldChange('showPastItems', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="showUpcomingItems" [checked]="showUpcomingItems()" (checkedChange)="onFieldChange('showUpcomingItems', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class InvitationsConfigComponent {
  // inputs
  public formData = model.required<InvitationsConfig>();
  public title = input('@content.section.type.invitations.title');
  public subTitle = input('@content.section.type.invitations.subtitle');
  public intro = input<string>();
  public readonly readOnly = input(true);

  // fields
  protected moreUrl = linkedSignal(() => this.formData().moreUrl ?? '');
  protected maxItems = linkedSignal(() => this.formData().maxItems ?? undefined);
  protected showPastItems = linkedSignal(() => this.formData().showPastItems ?? false);
  protected showUpcomingItems = linkedSignal(() => this.formData().showUpcomingItems ?? true);

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
