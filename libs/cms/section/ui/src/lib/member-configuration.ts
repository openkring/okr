import { Component, computed, input, linkedSignal, model, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { MemberCatConfig } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';

interface MemberConfigI18n {
  member_config_title:                  Signal<string>;
  member_config_subtitle:               Signal<string>;
  member_config_orgId_label:            Signal<string>;
  member_config_orgId_placeholder:      Signal<string>;
  member_config_orgId_helper:           Signal<string>;
  member_config_chartType_label:        Signal<string>;
  member_config_sortOrder_label:        Signal<string>;
  member_config_categoryFilter_label:       Signal<string>;
  member_config_categoryFilter_placeholder: Signal<string>;
  member_config_categoryFilter_helper:      Signal<string>;
}

/**
 * Shared config for member-age and member-cat sections. `MemberCatConfig` is the superset
 * (it adds `categoryFilter`); member-age binds the same type and hides the filter via
 * `showCategoryFilter=false`.
 */
@Component({
  selector: 'bk-member-config',
  standalone: true,
  imports: [
    TextInput, StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonCardSubtitle, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().member_config_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().member_config_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input [i18n]="orgIdI18n()" [value]="orgId()" (valueChange)="onFieldChange('orgId', $event)" [readOnly]="readOnly()" />
            </ion-col>
            @if(showCategoryFilter()) {
              <ion-col size="12">
                <bk-text-input [i18n]="categoryFilterI18n()" [value]="categoryFilter()" (valueChange)="onFieldChange('categoryFilter', $event)" [readOnly]="readOnly()" />
              </ion-col>
            }
            <ion-col size="12" size-md="6">
              <bk-string-select [i18n]="chartTypeI18n()" [selectedString]="chartType()" (selectedStringChange)="onFieldChange('chartType', $event)" [readOnly]="readOnly()" [stringList]="chartTypes" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select [i18n]="sortOrderI18n()" [selectedString]="sortOrder()" (selectedStringChange)="onFieldChange('sortOrder', $event)" [readOnly]="readOnly()" [stringList]="sortOrders" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class MemberConfiguration {
  // inputs
  public formData = model.required<MemberCatConfig>();
  public readonly readOnly = input(true);
  public readonly showCategoryFilter = input(false);
  public readonly i18n = input.required<MemberConfigI18n>();

  // passing constants to the template
  protected chartTypes = ['table', 'bar'];
  protected sortOrders = ['asc', 'desc'];

  // fields
  protected orgId = linkedSignal(() => this.formData().orgId ?? '');
  protected categoryFilter = linkedSignal(() => this.formData().categoryFilter ?? '');
  protected chartType = linkedSignal(() => this.formData().chartType ?? 'table');
  protected sortOrder = linkedSignal(() => this.formData().sortOrder ?? 'asc');

  protected orgIdI18n = computed(() => ({
    name: 'orgId',
    label: this.i18n().member_config_orgId_label(),
    placeholder: this.i18n().member_config_orgId_placeholder(),
    helper: this.i18n().member_config_orgId_helper(),
  } as TextInputI18n));

  protected categoryFilterI18n = computed(() => ({
    name: 'categoryFilter',
    label: this.i18n().member_config_categoryFilter_label(),
    placeholder: this.i18n().member_config_categoryFilter_placeholder(),
    helper: this.i18n().member_config_categoryFilter_helper(),
  } as TextInputI18n));

  protected chartTypeI18n = computed(() => ({ name: 'chartType', label: this.i18n().member_config_chartType_label() } as StringSelectI18n));
  protected sortOrderI18n = computed(() => ({ name: 'sortOrder', label: this.i18n().member_config_sortOrder_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: string, value: string): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }
}
