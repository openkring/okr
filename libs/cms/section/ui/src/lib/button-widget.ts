import { NgStyle } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { IonButton, IonIcon, ModalController } from '@ionic/angular/standalone';

import { ColorsIonic, getCategoryStringField } from '@bk2/shared-categories';
import { ENV } from '@bk2/shared-config';
import { BUTTON_HEIGHT, BUTTON_WIDTH, ICON_SIZE } from '@bk2/shared-constants';
import { ButtonAction, ButtonSection, ColorIonic } from '@bk2/shared-models';
import { showZoomedImage } from '@bk2/shared-ui';
import { downloadToBrowser, navigateByUrl } from '@bk2/shared-util-angular';
import { IMAGE_STYLE_SHAPE } from '@bk2/shared-models';

@Component({
  selector: 'bk-button-widget',
  standalone: true,
  imports: [
    NgStyle,
    IonButton, IonIcon
  ],
  styles: [`
    .container { margin: 0 auto !important; text-align: center; vertical-align: middle;}
    ion-button {
      width: var(--button-width);
      height: var(--button-height);
      min-width: var(--button-width);
      min-height: var(--button-height);
    }
  `],
  template: `
    <div class="container">
      <ion-button (click)="action()"
        [ngStyle]="buttonStyle()"
        shape="{{ shape() }}"
        fill="{{ fill() }}"
        color="{{ colorName() }}"
        size="large"
      >
        <ion-icon [ngStyle]="iconStyle()" src="{{ iconSrc() }}" slot="{{ iconSlot() }}" />
        @if(label(); as label) { {{ label }} }
      </ion-button>
    </div>
  `
})
export class ButtonWidgetComponent {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  protected readonly env = inject(ENV);

  // inputs
  public section = input.required<ButtonSection>();

  private readonly imgixBaseUrl = this.env.services.imgixBaseUrl;

  // derived values
  protected iconName = computed(() => this.section().properties?.icon?.name ?? 'help');
  protected iconSize = computed(() => this.section().properties?.icon?.size ?? ICON_SIZE);
  protected iconSlot = computed(() => this.section().properties?.icon?.slot ?? 'start');
  protected label = computed(() => this.section().properties?.style?.label ?? '');
  protected shape = computed(() => this.section().properties?.style?.shape ?? 'default');
  protected fill = computed(() => this.section().properties?.style?.fill ?? 'solid');
  protected width = computed(() => this.section().properties?.style?.width ?? BUTTON_WIDTH);
  protected height = computed(() => this.section().properties?.style?.height ?? BUTTON_HEIGHT);
  protected iconStyle = computed(() => {
    // Parse button dimensions (handle strings like "60px" or numbers)
    const width = parseInt(this.width().toString());
    const height = parseInt(this.height().toString());
    const buttonSize = Math.min(width, height);
    // Use explicit icon size if provided, otherwise scale to 60% of button size
    const explicitIconSize = this.section().properties?.icon?.size;
    const iconSize = explicitIconSize ?? Math.floor(buttonSize * 0.6);
    return {'font-size': iconSize + 'px' };
  });
  protected actionType = computed(() => this.section().properties?.action.type ?? ButtonAction.None);
  protected url = computed(() => this.section().properties?.action.url ?? '');
  protected buttonStyle = computed(() => {
    return {
      '--button-width': this.width(),
      '--button-height': this.height(),
      'color': this.color()
    };
  });

  // icons are part of an icon set (e.g. icons, filetypes, weather, models, general)
  // icon names consist of setName:iconName
  // setName is optional and defaults to 'icons'
  // the setName is needed to determine the folder where the icon is stored
  // all icon sets need to be stored in imgix under /logo/icons/ or /logo/filetypes/ etc.
  // ButtonWidget: tbd: logo directory should be configurable
  // ButtonWidget: tbd: make icon sets configurable by user
  protected iconSrc = computed(() => {
    let iconName = this.iconName();
    let iconSetName = 'icons';
    if (this.iconName().includes(':')) {
      const parts = this.iconName().split(':');
      iconSetName = parts[0];
      iconName = parts[1];
    }
    return `${this.imgixBaseUrl}/logo/${iconSetName}/${iconName}.svg`;
  });
  protected color = computed(() => this.section().properties?.style?.color ?? ColorIonic.Primary);
  protected colorName = computed(() => getCategoryStringField(ColorsIonic, this.color(), 'name'));
 
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);

  protected async action(): Promise<void> {
    const url = this.url();
    if (url) {
      switch (this.actionType()) {
        case ButtonAction.Download:
          if (url.startsWith('http'))  await downloadToBrowser(url);
          else                         await downloadToBrowser(this.imgixBaseUrl + '/' + url);
          break;
        case ButtonAction.Navigate:
          await navigateByUrl(this.router, this.url());
          break;
        case ButtonAction.Browse:
          await Browser.open({ url: this.url() });
          break;
        case ButtonAction.Zoom:
          await showZoomedImage(this.modalController, this.url(), '@content.type.article.zoomedImage', this.imageStyle(), this.label(), 'full-modal'); 
          break;
        case ButtonAction.None:
          break;
      }
    }
  }
}