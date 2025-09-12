import { AsyncPipe, NgStyle } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SectionModel } from '@bk2/shared-models';
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
        @if(header()?.length === 0 && content()?.length === 0) {
          <ion-item lines="none">
            <ion-label>{{'@content.section.error.emptyTable' | translate | async}}</ion-label>
          </ion-item>
        } @else {
          <div [ngStyle]="gridStyle()">
            @for(header of header(); track $index) {
              <div [ngStyle]="headerStyle()">{{header}}</div>
            }
            @for(cell of content(); track $index) {
              <div [ngStyle]="cellStyle()" [innerHTML]="cell"></div>
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
  public section = input<SectionModel>();
  protected config = computed(() => this.section()?.properties.table?.config);
  protected header = computed(() => this.section()?.properties.table?.header);
  protected content = computed(() => this.section()?.properties.table?.data);
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  protected gridStyle = computed(() => {
    return {
      'display': 'grid',
      'grid-template-columns': this.config()?.gridTemplate ?? 'auto auto',
      'gap': this.config()?.gridGap ?? '1px',
      'background-color': this.config()?.gridBackgroundColor ?? 'var(--ion-color-step-200)',
      'padding': this.config()?.gridPadding ?? '1px',
      'margin': '10px'
    };
  });

  protected headerStyle = computed(() => {
    return {
      'background-color': this.config()?.headerBackgroundColor ?? 'var(--ion-color-step-150)',
      'text-align': this.config()?.headerTextAlign ?? 'center',
      'font-size': this.config()?.headerFontSize ?? '1rem',
      'font-weight': this.config()?.headerFontWeight ?? 'bold',
      'padding': this.config()?.headerPadding ?? '5px',
    };
  });

  protected cellStyle = computed(() => {
    return {
      'background-color': this.config()?.cellBackgroundColor ?? 'var(--ion-color-background)',
      'text-align': this.config()?.cellTextAlign ?? 'left',
      'font-size': this.config()?.cellFontSize ?? '0.8rem',
      'font-weight': this.config()?.cellFontWeight ?? 'normal',
      'padding': this.config()?.cellPadding ?? '5px',
      '-webkit-user-select': 'text',
      '-moz-user-select': 'text',
      '-ms-user-select': 'text',
      'user-select': 'text'
    };
  });
}
