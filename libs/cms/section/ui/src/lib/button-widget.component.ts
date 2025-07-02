import { NgStyle } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon, ModalController } from '@ionic/angular/standalone';
import { Browser } from '@capacitor/browser';

import { ColorsIonic } from '@bk2/shared/categories';
import { ButtonAction, ColorIonic, ImageAction, newButton, newIcon, newImage, SectionModel } from '@bk2/shared/models';
import { CategoryPlainNamePipe, FileTypeIconPipe, SvgIconPipe } from '@bk2/shared/pipes';
import { downloadToBrowser, navigateByUrl } from '@bk2/shared/util-angular';
import { showZoomedImage } from '@bk2/shared/ui';
import { ENV } from '@bk2/shared/config';
import { BUTTON_HEIGHT, BUTTON_WIDTH, ICON_SIZE } from '@bk2/shared/constants';

@Component({
  selector: 'bk-button-widget',
  imports: [
    CategoryPlainNamePipe, FileTypeIconPipe, SvgIconPipe,
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
        shape="{{button().shape}}"
        fill="{{button().fill}}"
        color="{{button().color | categoryPlainName:colorsIonic}}">
        @if(iconName(); as iconName) {
          @if(button().buttonAction === BA.Download) {
            <ion-icon [ngStyle]="iconStyle()" src="{{ iconName | fileTypeIcon}}" slot="{{icon().slot}}" />
          } @else {
            <ion-icon [ngStyle]="iconStyle()" src="{{iconName | svgIcon}}" slot="{{icon().slot}}" />
          }
        }
        @if(button().label) {
          {{button().label}}
        }
      </ion-button>
    </div>
  `
})
export class ButtonWidgetComponent {
  private readonly modalController = inject(ModalController);
  private readonly router = inject(Router);
  protected readonly env = inject(ENV);

  public section = input.required<SectionModel>();

  protected button = computed(() => this.section()?.properties.button ?? newButton());
  protected icon = computed(() => this.section()?.properties.icon ?? newIcon());
  protected iconName = computed(() => this.icon().name ?? '');
  private readonly url = computed(() => this.button().url ?? '');
  private readonly image = computed(() => this.section()?.properties.image ?? newImage('Image Zoom', this.url()));

  protected colorsIonic = ColorsIonic;
  protected BA = ButtonAction;

  protected iconStyle = computed(() => {
    return {
      'font-size': (this.icon().size ?? ICON_SIZE) + 'px'
    };
  });

  protected buttonStyle = computed(() => {
    return {
      'width': (this.button().width ?? BUTTON_WIDTH) + 'px',
      'height': (this.button().height ?? BUTTON_HEIGHT) + 'px',
      'color': this.button().color ?? ColorIonic.Primary
    };
  });

  protected async action(): Promise<void> {
    if (this.url()) {
      switch (this.button().buttonAction) {
        case ButtonAction.Download:
          await downloadToBrowser(this.env.services.imgixBaseUrl + this.url());
          break;
        case ButtonAction.Navigate:
          await navigateByUrl(this.router, this.url());
          break;
        case ButtonAction.Browse:
          await Browser.open({ url: this.url() });
          break;
        case ButtonAction.Zoom:
          this.image().imageAction = ImageAction.Zoom;
          this.image().width = 160;
          this.image().height = 90;
          await showZoomedImage(this.modalController, '@content.type.article.zoomedImage', this.image(), 'full-modal'); 
          break;
        case ButtonAction.None:
          break;
      }
    }
  }
}