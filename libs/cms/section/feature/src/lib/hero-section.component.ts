import { Component, computed, input } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { ImageAction, SectionModel } from '@bk2/shared/models';
import { ImageComponent, SpinnerComponent } from '@bk2/shared/ui';
import { die } from '@bk2/shared/util-core';

@Component({
  selector: 'bk-hero-section',
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
        <bk-img class="hero-image" [image]="heroImage()" />
        <ion-grid class="hero-form">
          @if(section.properties.image) {   <!-- logo image -->
            <ion-row>
              <ion-col>
                <bk-img class="logo" [image]="logoImage()" />
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
  public section = input<SectionModel>();
  protected heroImage = computed(() => {
    const _imageList = this.section()?.properties.imageList ?? [];
    if (_imageList.length !== 2) die('HeroSection.heroImage: Hero section must have 2 images');
    _imageList[0].hasPriority = true;
    _imageList[0].imageAction = ImageAction.None;
    _imageList[0].isThumbnail = false;
    _imageList[0].fill = true;
    _imageList[0].altText = 'hero image';
    return _imageList[0];
  });
  protected logoImage = computed(() => {
    const _imageList = this.section()?.properties.imageList ?? [];
    if (_imageList.length !== 2) die('HeroSection.logoImage: Hero section must have 2 images');
    _imageList[1].hasPriority = false;
    _imageList[1].imageAction = ImageAction.None;
    _imageList[1].isThumbnail = false;
    _imageList[1].fill = true;
    _imageList[1].altText = 'logo image';
    return _imageList[1];
  });
}