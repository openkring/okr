import { Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ButtonSection, ViewPosition } from '@bk2/shared-models';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

import { ButtonWidgetComponent } from '@bk2/cms-section-ui';


@Component({
  selector: 'bk-button-section',
  standalone: true,
  imports: [
    SpinnerComponent, ButtonWidgetComponent,
    OptionalCardHeaderComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @switch(position()) {
            @case(VP.Left) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12" [sizeMd]="colSizeButton()">
                    <bk-button-widget [section]="section" [editMode]="editMode()" />
                  </ion-col>
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                  <ion-col size="12" [sizeMd]="colSizeButton()">
                    <bk-button-widget [section]="section" [editMode]="editMode()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <bk-button-widget [section]="section" [editMode]="editMode()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Bottom) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                  <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <bk-button-widget [section]="section" [editMode]="editMode()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <bk-button-widget [section]="section" [editMode]="editMode()" />
            }
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class ButtonSectionComponent {
  // inputs
  public section = input<ButtonSection>();
  public editMode = input<boolean>(false);

  // computed
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected colSizeButton = computed(() => this.section()?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeButton());
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;
}