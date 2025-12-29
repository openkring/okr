import { Component, computed, input } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { HeroSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE } from '@bk2/shared-models';
import { ImageComponent, SpinnerComponent } from '@bk2/shared-ui';

@Component({
  selector: 'bk-hero-section',
  standalone: true,
  imports: [
    SpinnerComponent, ImageComponent,
    IonGrid, IonRow, IonCol
  ],
  styles: [`
    .hero-container { display: flex; justify-content: center; align-items: center; height: 100%; min-height: 700px;}
    .hero-image { position: absolute; padding: 0; padding-top: 0; top: 0; left: 0; width: 100%; height: auto; min-height: 700px; object-fit: cover; opacity: 0.7; z-index: 1;}
    .hero-form {background-color: rgba(255, 255, 255); padding: 20px; border-radius: 10px; width: 600px; max-width: 600px; width: 90%; text-align: center; z-index: 5;}
    .title { text-align: center; font-size: 2rem;}
    .subtitle { text-align: center; font-size: 1.2rem;}
    .logo { max-width: 300px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; }
  `],
  template: `
    @if(section(); as section) {
      <div class="hero-container">
        <bk-img class="hero-image" [image]="heroImage()" [imageStyle]="imageStyle()" />
        <ion-grid class="hero-form">
          @if(logoImage(); as logoImage) {
            <ion-row>
              <ion-col>
                <bk-img class="logo" [image]="logoImage" [imageStyle]="imageStyle()" />
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      </div>
    } @else {
      <bk-spinner />
    }
  `
})
export class HeroSectionComponent {

  // inputs
  public section = input<HeroSection>();

  // derived values
  protected heroImage = computed(() => this.section()?.properties.hero ?? IMAGE_CONFIG_SHAPE);
  // tbd on heroImage: hasPriority=true, ImageAction.None, isThumbnail=false, fill=true, altText='hero image'
  protected logoImage = computed(() => this.section()?.properties.logo ?? IMAGE_CONFIG_SHAPE);
  // tbd on logoImage: hasPriority=false, ImageAction.None, isThumbnail=false, fill=true, altText='logo image'
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);
}
