import { Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { PeopleSection, ViewPosition } from "@bk2/shared-models";
import { OptionalCardHeaderComponent, SpinnerComponent } from "@bk2/shared-ui";

import { PersonsWidgetComponent } from '@bk2/cms-section-ui';

@Component({
  selector: 'bk-people-section',
  standalone: true,
  imports: [
    SpinnerComponent, PersonsWidgetComponent, OptionalCardHeaderComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @switch(position()) {
            @case(VP.Left) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12" [sizeMd]="colSizeImage()">
                    <bk-persons-widget [section]="section" />
                  </ion-col>
                  @if(content(); as content) {
                    <ion-col size="12" [sizeMd]="colSizeText()">
                      <div [innerHTML]="content"></div>
                    </ion-col>
                  }
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  @if(content(); as content) {
                    <ion-col size="12" [sizeMd]="colSizeText()">
                      <div [innerHTML]="content"></div>
                    </ion-col>
                  }
                  <ion-col size="12" [sizeMd]="colSizeImage()">
                    <bk-persons-widget [section]="section" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <bk-persons-widget [section]="section" />
              @if(content(); as content) {
                <div [innerHTML]="content"></div>
              }
            }
            @case(VP.Bottom) {
              @if(content(); as content) {
                <div [innerHTML]="content"></div>
              }
              <bk-persons-widget [section]="section" />
            }
            @default { <!-- VP.None -->
              <bk-persons-widget [section]="section" />
            }
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class PeopleSectionComponent {
  // inputs
  public section = input<PeopleSection>();

  // fields
  protected content = computed(() => this.section()?.content?.htmlContent || '<p></p>'); // check for undefined or empty content
  protected colSizeImage = computed(() => this.section()?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  // passing constants to template
  public VP = ViewPosition;
}
