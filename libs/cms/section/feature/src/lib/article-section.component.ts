import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { SectionModel, ViewPosition } from '@bk2/shared-models';
import { EditorComponent, ImageComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-article-section',
  standalone: true,
  imports: [
    SpinnerComponent, EditorComponent, ImageComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    OptionalCardHeaderComponent
],
  schemas: [ 
    CUSTOM_ELEMENTS_SCHEMA
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section()) {
      <ion-card>
        <bk-optional-card-header  [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @switch(position()) {
            @case(VP.Left) {
              <ion-grid>
                <ion-row>
                  @if(image(); as image) {
                    <ion-col size="12" [sizeMd]="colSizeImage()">
                      <bk-img [image]="image" />
                    </ion-col>
                  }
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <bk-editor [content]="content()" [readOnly]="readOnly()" (contentChange)="onContentChange($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <bk-editor [content]="content()" [readOnly]="readOnly()" (contentChange)="onContentChange($event)" />
                  </ion-col>
                  @if(image(); as image) {
                    <ion-col size="12" [sizeMd]="colSizeImage()">
                      <bk-img [image]="image" />
                    </ion-col>
                  }
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              @if(image(); as image) {
                <bk-img [image]="image" />
              }
              <bk-editor [content]="content()" [readOnly]="readOnly()" (contentChange)="onContentChange($event)" />
            }
            @case(VP.Bottom) {
              <bk-editor [content]="content()" [readOnly]="readOnly()" (contentChange)="onContentChange($event)" />
              @if(image(); as image) {
                <bk-img [image]="image" />
              }
            }
            @default {  <!-- VP.None -->
              <bk-editor [content]="content()" [readOnly]="readOnly()" (contentChange)="onContentChange($event)" />
            }
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class ArticleSectionComponent {
  public section = input<SectionModel>();
  public readOnly = input(false);
  public contentChange = output<string>();

  protected image = computed(() => this.section()?.properties.image);
  protected content = computed(() => this.section()?.properties?.content?.htmlContent ?? '<p></p>');
  protected colSizeImage = computed(() => this.section()?.properties?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.properties?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected title = computed(() => this.section()?.title);
  protected subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;

  protected onContentChange(content: string): void {
    this.contentChange.emit(content);
  }
}