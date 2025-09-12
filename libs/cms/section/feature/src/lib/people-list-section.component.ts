import { Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ModelType, NameDisplay, SectionModel, ViewPosition } from "@bk2/shared-models";
import { EditorComponent, OptionalCardHeaderComponent, SpinnerComponent } from "@bk2/shared-ui";

import { PersonsWidgetComponent } from '@bk2/cms-section-ui';

@Component({
  selector: 'bk-people-list-section',
  standalone: true,
  imports: [
    SpinnerComponent, PersonsWidgetComponent, EditorComponent, OptionalCardHeaderComponent,
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
                      <bk-editor [content]="content" [readOnly]="true" />
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
                      <bk-editor [content]="content" [readOnly]="true" />
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
                <bk-editor [content]="content" [readOnly]="true" />
              }
            }
            @case(VP.Bottom) {
              @if(content(); as content) {
                <bk-editor [content]="content" [readOnly]="true" />
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
export class PeopleListSectionComponent {
  public section = input<SectionModel>();
  public readOnly = input(false);
  public contentChange = output<string>();

  protected content = computed(() => this.section()?.properties?.content?.htmlContent ?? '<p></p>');
  protected colSizeImage = computed(() => this.section()?.properties?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.properties?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  public ND = NameDisplay;
  public MT = ModelType;
  public VP = ViewPosition;


  protected onContentChange(content: string): void {
    this.contentChange.emit(content);
  }
}
