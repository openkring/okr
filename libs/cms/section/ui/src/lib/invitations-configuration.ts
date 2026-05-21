import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { InvitationsConfig } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

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
          <ion-card-title>{{ title() }}</ion-card-title>
          <ion-card-subtitle>{{ subTitle() }}</ion-card-subtitle>
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
  private readonly i18nService = inject(I18nService);

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

  protected readonly fieldI18n = this.i18nService.translateAll({
    moreUrl_label:         PFX + 'moreUrl.label',
    moreUrl_placeholder:   PFX + 'moreUrl.placeholder',
    moreUrl_helper:        PFX + 'moreUrl.helper',
    maxItems_label:           PFX + 'maxItems.label',
    maxItems_placeholder:     PFX + 'maxItems.placeholder',
    maxItems_helper:          PFX + 'maxItems.helper',
    showPastItems_label:      PFX + 'showPastItems.label',
    showPastItems_helper:     PFX + 'showPastItems.helper',
    showUpcomingItems_label:  PFX + 'showUpcomingItems.label',
    showUpcomingItems_helper: PFX + 'showUpcomingItems.helper',
  });

  protected maxItemsI18n = computed(() => ({ name: 'maxItems', label: this.fieldI18n.maxItems_label(), placeholder: this.fieldI18n.maxItems_placeholder(), helper: this.fieldI18n.maxItems_helper() } as NumberInputI18n));

  protected moreUrlI18n = computed(() => ({
    name: 'moreUrl',
    label: this.fieldI18n.moreUrl_label(),
    placeholder: this.fieldI18n.moreUrl_placeholder(),
    helper: this.fieldI18n.moreUrl_helper(),
  } as TextInputI18n));

  protected showPastItemsI18n = computed(() => ({
    name: 'showPastItems',
    label: this.fieldI18n.showPastItems_label(),
    helper: this.fieldI18n.showPastItems_helper(),
  } as CheckboxI18n));

  protected showUpcomingItemsI18n = computed(() => ({
    name: 'showUpcomingItems',
    label: this.fieldI18n.showUpcomingItems_label(),
    helper: this.fieldI18n.showUpcomingItems_helper(),
  } as CheckboxI18n));

  protected onFieldChange(fieldName: string, $event: string | boolean | number): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
  }
}
