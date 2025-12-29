import { NgStyle } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { IonButton, IonIcon, ModalController } from '@ionic/angular/standalone';

import { ColorsIonic, getCategoryStringField } from '@bk2/shared-categories';
import { ENV } from '@bk2/shared-config';
import { BUTTON_HEIGHT, BUTTON_WIDTH, ICON_SIZE } from '@bk2/shared-constants';
import { BUTTON_STYLE_SHAPE, ButtonAction, ButtonSection, ColorIonic } from '@bk2/shared-models';
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
  `],
  template: `
    <div class="container">
      <ion-button (click)="action()"
        [ngStyle]="buttonStyle()"
        shape="{{ shape() }}"
        fill="{{ fill() }}"
        color="{{ colorName() }}"
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
  protected iconStyle = computed(() => ({'font-size': (this.iconSize() ?? ICON_SIZE) + 'px'}));
  protected actionType = computed(() => this.section().properties?.action.type ?? ButtonAction.None);
  protected url = computed(() => this.section().properties?.action.url ?? '');
  protected buttonStyle = computed(() => {
    const style = this.section().properties?.style ?? BUTTON_STYLE_SHAPE;
    style.width = this.width();
    style.height = this.height();
    style.color = this.color();
    return style;
  });
  protected iconSrc = computed(() => {
    const dir = this.actionType() === ButtonAction.Download ? 'filetypes' : 'icons';
    return `${this.imgixBaseUrl}/logo/${dir}/${this.iconName()}.svg`;
  });
  protected color = computed(() => this.section().properties?.style?.color ?? ColorIonic.Primary);
  protected colorName = computed(() => getCategoryStringField(ColorsIonic, this.color(), 'name'));
 
  protected imageStyle = computed(() => this.section()?.properties.imageStyle ?? IMAGE_STYLE_SHAPE);

  protected async action(): Promise<void> {
    if (this.url()) {
      switch (this.actionType()) {
        case ButtonAction.Download:
          await downloadToBrowser(this.imgixBaseUrl + '/' + this.url());
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