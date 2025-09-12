import { Component, computed, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { HtmlTextMask } from '@bk2/shared-config';
import { Table } from '@bk2/shared-models';
import { StringsComponent, TextInputComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-table-section-form',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    StringsComponent, TextInputComponent
  ],
  template: `
    @if(table(); as table) {
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Tabellen - Konfiguration</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="gridTemplate" [value]="gridTemplate()" [showHelper]="true" (changed)="onChange('gridTemplate', $event)" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="gridGap" [value]="gridGap()" [showHelper]="true" (changed)="onChange('gridGap', $event)" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="gridBackgroundColor" [value]="gridBackgroundColor()" [showHelper]="true" (changed)="onChange('gridBackgroundColor', $event)" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="gridPadding" [value]="gridPadding()" [showHelper]="true" (changed)="onChange('gridPadding', $event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Header/Titel - Konfiguration</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="headerBackgroundColor" [value]="headerBackgroundColor()" [showHelper]="true" (changed)="onChange('headerBackgroundColor', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="headerTextAlign" [value]="headerTextAlign()" [showHelper]="true" (changed)="onChange('headerTextAlign', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="headerFontSize" [value]="headerFontSize()" [showHelper]="true" (changed)="onChange('headerFontSize', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="headerFontWeight" [value]="headerFontWeight()" [showHelper]="true" (changed)="onChange('headerFontWeight', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="headerPadding" [value]="headerPadding()" [showHelper]="true" (changed)="onChange('headerPadding', $event)"/>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>Felder - Konfiguration</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="cellBackgroundColor" [value]="cellBackgroundColor()" [showHelper]="true" (changed)="onChange('cellBackgroundColor', $event)" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="cellTextAlign" [value]="cellTextAlign()" [showHelper]="true" (changed)="onChange('cellTextAlign', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="cellFontSize" [value]="cellFontSize()" [showHelper]="true" (changed)="onChange('cellFontSize', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="cellFontWeight" [value]="cellFontWeight()" [showHelper]="true" (changed)="onChange('cellFontWeight', $event)"/>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-text-input name="cellPadding" [value]="cellPadding()" [showHelper]="true" (changed)="onChange('cellPadding', $event)"/>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12"> 
          <bk-strings (changed)="onChange('header', $event)"
            [strings]="header()"
            [mask]="mask"
            [maxLength]="40"
            title="@input.tableHeader.title"
            description="@input.tableHeader.description"
            addLabel="@input.tableHeader.addLabel" />
        </ion-col>
      </ion-row>
      <ion-row>
        <ion-col size="12">
          <bk-strings (changed)="onChange('content', $event)"
            [strings]="content()"
            [mask]="mask"
            [maxLength]="500" 
            title="@input.tableContent.title"
          description="@input.tableContent.description"
          addLabel="@input.tableContent.addLabel" />
        </ion-col>
      </ion-row>
    }
  `
})
export class TableSectionFormComponent {
  public table = model.required<Table>();
  protected header = computed(() => this.table().header ?? []);
  protected content = computed(() => this.table().data ?? []);
  protected gridTemplate = computed(() => this.table().config?.gridTemplate ?? 'auto auto');
  protected gridGap = computed(() => this.table().config?.gridGap ?? '1px');
  protected gridBackgroundColor = computed(() => this.table().config?.gridBackgroundColor ?? 'grey');
  protected gridPadding = computed(() => this.table().config?.gridPadding ?? '1px');
  protected headerBackgroundColor = computed(() => this.table().config?.headerBackgroundColor ?? 'lightgrey');
  protected headerTextAlign = computed(() => this.table().config?.headerTextAlign ?? 'center');
  protected headerFontSize = computed(() => this.table().config?.headerFontSize ?? '1rem');
  protected headerFontWeight = computed(() => this.table().config?.headerFontWeight ?? 'bold');
  protected headerPadding = computed(() => this.table().config?.headerPadding ?? '5px');
  protected cellBackgroundColor = computed(() => this.table().config?.cellBackgroundColor ?? 'white');
  protected cellTextAlign = computed(() => this.table().config?.cellTextAlign ?? 'left');
  protected cellFontSize = computed(() => this.table().config?.cellFontSize ?? '0.8rem');
  protected cellFontWeight = computed(() => this.table().config?.cellFontWeight ?? 'normal');
  protected cellPadding = computed(() => this.table().config?.cellPadding ?? '5px');

  public changed = output<Table>();

  protected mask = HtmlTextMask;

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    if (fieldName === 'header' || fieldName === 'content') {
      this.table.update((table) => ({ ...table, [fieldName]: $event }));
    } else {
      this.table.update((table) => ({ ...table, config: { ...table.config, [fieldName]: $event } }));
    }
    this.changed.emit(this.table());
  }
}