import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ArticleSection, IMAGE_STYLE_SHAPE, ViewPosition } from '@bk2/shared-models';
import { ImageComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-article-section',
  standalone: true,
  imports: [
    SpinnerComponent, ImageComponent,
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
                      <bk-img [image]="image" [imageStyle]="imageStyle()" />
                    </ion-col>
                  }
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <ion-item lines="none">
                      <div [innerHTML]="content()"></div>
                    </ion-item>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12" [sizeMd]="colSizeText()">
                    <ion-item lines="none">
                      <div [innerHTML]="content()"></div>
                    </ion-item>
                  </ion-col>
                  @if(image(); as image) {
                    <ion-col size="12" [sizeMd]="colSizeImage()">
                      <bk-img [image]="image" [imageStyle]="imageStyle()"  />
                    </ion-col>
                  }
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                @if(image(); as image) {
                  <ion-row>
                    <ion-col size="12">
                      <bk-img [image]="image" [imageStyle]="imageStyle()"  />
                    </ion-col>
                  </ion-row>
                }
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <div [innerHTML]="content()"></div>
                    </ion-item>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Bottom) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <div [innerHTML]="content()"></div>
                    </ion-item>
                  </ion-col>
                </ion-row>
                @if(image(); as image) {
                  <ion-row>
                    <ion-col size="12">
                      <bk-img [image]="image" [imageStyle]="imageStyle()"  />
                    </ion-col>
                  </ion-row>
                }
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <ion-item lines="none">
                <div [innerHTML]="content()"></div>
              </ion-item>
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
  // inputs
  public section = input<ArticleSection>();

  // computed
  protected image = computed(() => this.section()?.properties.image);
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected colSizeImage = computed(() => this.section()?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected title = computed(() => this.section()?.title);
  protected subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;
}