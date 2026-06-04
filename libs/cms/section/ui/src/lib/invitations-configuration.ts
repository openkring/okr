import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { InvitationsConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';

interface InvitationsConfigI18n {
    invitation_title:                     Signal<string>;
    invitation_subtitle:                  Signal<string>;
    invitation_more_label:                Signal<string>;
    invitation_more_placeholder:          Signal<string>;
    invitation_more_helper:               Signal<string>;
    invitation_maxItems_label:            Signal<string>;
    invitation_maxItems_placeholder:      Signal<string>;
    invitation_maxItems_helper:           Signal<string>;
    invitation_showPastItems_label:       Signal<string>;
    invitation_showPastItems_helper:      Signal<string>;
    invitation_showUpcomingItems_label:   Signal<string>;
    invitation_showUpcomingItems_helper:  Signal<string>;
}

@Component({
  selector: 'bk-invitations-config',
  standalone: true,
  imports: [
    TextInput, Checkbox, NumberInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonCardSubtitle
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `

    <ion-card>
      <ion-card-header>
          <ion-card-title>{{ i18n().invitation_title() }}</ion-card-title>
          <ion-card-subtitle>{{ i18n().invitation_subtitle() }}</ion-card-subtitle>
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
              <bk-text-input [i18n]="moreUrlI18n()" [value]="moreUrl()" (valueChange)="onFieldChange('moreUrl', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12">
              <bk-number-input [i18n]="maxItemsI18n()" [value]="maxItems()" (valueChange)="onFieldChange('maxItems', $event)" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showPastItemsI18n()" [checked]="showPastItems()" (checkedChange)="onFieldChange('showPastItems', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox [i18n]="showUpcomingItemsI18n()" [checked]="showUpcomingItems()" (checkedChange)="onFieldChange('showUpcomingItems', $event)" [showHelper]="true" [readOnly]="readOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class InvitationsConfiguration {
  // inputs
  public formData = model.required<InvitationsConfig>();
  public intro = input<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<InvitationsConfigI18n>();

  // fields
  protected moreUrl = linkedSignal(() => this.formData().moreUrl ?? '');
  protected maxItems = linkedSignal(() => this.formData().maxItems ?? undefined);
  protected showPastItems = linkedSignal(() => this.formData().showPastItems ?? false);
  protected showUpcomingItems = linkedSignal(() => this.formData().showUpcomingItems ?? true);

  protected maxItemsI18n = computed(() => ({ name: 'maxItems', label: this.i18n().invitation_maxItems_label(), placeholder: this.i18n().invitation_maxItems_placeholder(), helper: this.i18n().invitation_maxItems_helper() } as NumberInputI18n));

  protected moreUrlI18n = computed(() => ({
    name: 'moreUrl',
    label: this.i18n().invitation_more_label(),
    placeholder: this.i18n().invitation_more_placeholder(),
    helper: this.i18n().invitation_more_helper(),
  } as TextInputI18n));

  protected showPastItemsI18n = computed(() => ({
    name: 'showPastItems',
    label: this.i18n().invitation_showPastItems_label(),
    helper: this.i18n().invitation_showPastItems_helper(),
  } as CheckboxI18n));

  protected showUpcomingItemsI18n = computed(() => ({
    name: 'showUpcomingItems',
    label: this.i18n().invitation_showUpcomingItems_label(),
    helper: this.i18n().invitation_showUpcomingItems_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
