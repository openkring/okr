import { CUSTOM_ELEMENTS_SCHEMA, Component, computed, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonRow } from '@ionic/angular/standalone';

import { ArticleSection, IMAGE_STYLE_SHAPE, ImageConfig, ViewPosition } from '@bk2/shared-models';
import { ImageComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-article-section',
  standalone: true,
  imports: [
    SpinnerComponent, ImageComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem,
    OptionalCardHeaderComponent
  ],
  schemas: [
    CUSTOM_ELEMENTS_SCHEMA
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    .carousel-container { position: relative; margin: 0.5rem 0; }
    .carousel {
      display: flex;
      gap: 1rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      border-radius: 12px;
      scrollbar-width: none;
      scroll-marker-group: after;
    }
    .carousel::scroll-marker-group {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      padding-top: 1rem;
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
    }
    .carousel-slide {
      flex: 0 0 100%;
      scroll-snap-align: center;
      container-type: scroll-state;
      container-name: slide;
    }
    .carousel-slide::scroll-marker {
      content: "";
      width: 12px; height: 12px;
      background: #d1d5db;
      border: 1px solid #9ca3af;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    .carousel-slide::scroll-marker:hover { background: #9ca3af; }
    .carousel-slide::scroll-marker:target-current { background: #3b82f6; transform: scale(1.3); border: 1px solid black; }
    .carousel::scroll-button(*) {
      border: none; background: white; color: #374151;
      font-size: 1.25rem; width: 40px; height: 40px;
      border-radius: 50%; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: all 0.2s;
      position: absolute; top: 50%; transform: translateY(-50%); z-index: 10;
    }
    .carousel::scroll-button(*):hover:not(:disabled) { background: #3b82f6; color: white; }
    .carousel::scroll-button(*):disabled { opacity: 0.3; cursor: not-allowed; }
    .carousel::scroll-button(left)  { content: "<"; left: 1.5rem; }
    .carousel::scroll-button(right) { content: ">"; right: 1.5rem; }
  `],
  template: `
    @if(section()) {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (images().length > 0 || (content() && content()!.length > 7)) {
            @switch(position()) {
              @case(VP.Left) {
                <ion-grid>
                  <ion-row>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <bk-img [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    }
                    <ion-col size="12" [sizeMd]="colSizeText()">
                      <ion-item lines="none" class="ion-no-padding">
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
                      <ion-item lines="none" class="ion-no-padding">
                        <div [innerHTML]="content()"></div>
                      </ion-item>
                    </ion-col>
                    @if(image(); as image) {
                      <ion-col size="12" [sizeMd]="colSizeImage()">
                        <bk-img [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    }
                  </ion-row>
                </ion-grid>
              }
              @case(VP.Top) {
                <ion-grid>
                  @if(images().length > 1) {
                    <ion-row>
                      <ion-col size="12">
                        <div class="carousel-container">
                          <div class="carousel">
                            @for(img of images(); track img.url) {
                              <div class="carousel-slide">
                                <bk-img [image]="img" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                              </div>
                            }
                          </div>
                        </div>
                      </ion-col>
                    </ion-row>
                  } @else if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <bk-img [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    </ion-row>
                  }
                  @if (content(); as content) {
                    @if(content.length > 7) {
                      <ion-row>
                        <ion-col size="12">
                          <ion-item lines="none" class="ion-no-padding">
                            <div [innerHTML]="content"></div>
                          </ion-item>
                        </ion-col>
                      </ion-row>
                    }
                  }
                </ion-grid>
              }
              @case(VP.Bottom) {
                <ion-grid>
                  @if (content(); as content) {
                    @if(content.length > 7) {
                      <ion-row>
                        <ion-col size="12">
                          <ion-item lines="none" class="ion-no-padding">
                            <div [innerHTML]="content"></div>
                          </ion-item>
                        </ion-col>
                      </ion-row>
                    }
                  }
                  @if(image(); as image) {
                    <ion-row>
                      <ion-col size="12">
                        <bk-img [image]="image" [imageStyle]="imageStyle()" [editMode]="editMode()" />
                      </ion-col>
                    </ion-row>
                  }
                </ion-grid>
              }
              @default {  <!-- VP.None: no image, content only -->
                <ion-item lines="none">
                  <div [innerHTML]="content()"></div>
                </ion-item>
              }
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
  public editMode = input<boolean>(false);

  // computed
  protected images = computed((): ImageConfig[] => {
    const props = this.section()?.properties as any;
    if (!props) return [];
    // backward compat: support legacy single-image field
    if (Array.isArray(props.images) && props.images.length > 0) return props.images;
    if (props.image) return [props.image];    // backward compatibility
    return [];
  });

  // Single image (only when exactly 1 image is configured)
  protected image = computed(() => {
    const imgs = this.images();
    return imgs.length === 1 ? imgs[0] : undefined;
  });

  protected position = computed((): ViewPosition => {
    const count = this.images().length;
    if (count === 0) return ViewPosition.None;
    if (count > 1) return ViewPosition.Top;
    return this.section()?.content?.position ?? ViewPosition.None;
  });

  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected colSizeImage = computed(() => this.section()?.content?.colSize ?? 6);
  protected colSizeText = computed(() => 12 - this.colSizeImage());
  protected title = computed(() => this.section()?.title);
  protected subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;
}
