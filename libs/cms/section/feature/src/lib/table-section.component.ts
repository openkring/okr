import { AsyncPipe, NgStyle } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { TableSection } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

/**
 * Data grid based on open source (Generic UI Data Grid)[https://generic-ui.com/].
 * features virtual scrolling, editing, multi sorting, searching, automatic summaries calculations
 * themes
 * See Documentation: https://generic-ui.com/guide/nx-angular-cli
 * title is shown as a legend below the table
 * subTitle is not used
 */
@Component({
  selector: 'bk-table-section',
  standalone: true,
  imports: [
    SpinnerComponent, OptionalCardHeaderComponent,
    NgStyle,
    TranslatePipe, AsyncPipe,
    IonCard, IonCardContent, IonLabel, IonItem
    ],
  styles: [`
  ion-card-content { padding: 5px; }
  ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  legend { padding: 0px; margin: 0px;  }
  ion-label { margin-top: 0px; }
`],
  template: `
  @if(section(); as section) {
    <ion-card>
      <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
      <ion-card-content>
        @if(header()?.length === 0 && body()?.length === 0) {
          <ion-item lines="none">
            <ion-label>{{'@content.section.error.emptyTable' | translate | async}}</ion-label>
          </ion-item>
        } @else {
          <div [ngStyle]="gridStyle()">
            @for(header of header(); track $index) {
              <div [ngStyle]="headerStyle()">{{header}}</div>
            }
            @for(cell of body(); track $index) {
              <div [ngStyle]="bodyStyle()" [innerHTML]="cell"></div>
            }
          </div>
        }
        @if(section.title && section.title !== '') {
          <ion-item lines="none" class="legend">
            <ion-label><i>{{ section.title | translate | async}}</i></ion-label>
          </ion-item>
        }
      </ion-card-content>
    </ion-card>
  } @else {
    <bk-spinner />
  }
`
})
export class TableSectionComponent {
  public section = input<TableSection>();
  protected config = computed(() => this.section()?.properties);
  protected header = computed(() => this.section()?.properties?.data.header);
  protected body = computed(() => this.section()?.properties?.data.body);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  protected gridStyle = computed(() => {
    return {
      'display': 'grid',
      'grid-template-columns': this.config()?.grid.template ?? 'auto auto',
      'gap': this.config()?.grid.gap ?? '1px',
      'background-color': this.config()?.grid.backgroundColor ?? 'var(--ion-color-step-200)',
      'padding': this.config()?.grid.padding ?? '1px',
      'margin': '10px'
    };
  });

  protected headerStyle = computed(() => {
    return {
      'background-color': this.config()?.header.backgroundColor ?? 'var(--ion-color-step-150)',
      'text-align': this.config()?.header.textAlign ?? 'center',
      'font-size': this.config()?.header.fontSize ?? '1rem',
      'font-weight': this.config()?.header.fontWeight ?? 'bold',
      'padding': this.config()?.header.padding ?? '5px',
    };
  });

  protected bodyStyle = computed(() => {
    return {
      'backgroundColor': this.config()?.body.backgroundColor ?? 'var(--ion-color-background)',
      'text-align': this.config()?.body.textAlign ?? 'left',
      'font-size': this.config()?.body.fontSize ?? '0.8rem',
      'font-weight': this.config()?.body.fontWeight ?? 'normal',
      'padding': this.config()?.body.padding ?? '5px',
      '-webkit-user-select': 'text',
      '-moz-user-select': 'text',
      '-ms-user-select': 'text',
      'user-select': 'text'
    };
  });
}
