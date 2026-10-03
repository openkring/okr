import { Component, input } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

/**
 * The info text of a menu row or sub-menu header (`MenuItemModel.info`), opened from its
 * info-circle (`MenuInfo`). Read-only: a header with the close button and the HTML.
 *
 * Rendered through `[innerHTML]`, which Angular sanitises (scripts, event handlers and
 * `javascript:` URLs are stripped). Deliberately NOT `okr-editor` in read-only mode: that pulls
 * ngx-editor in, and this modal hangs off the main menu, which every app loads at boot.
 */
@Component({
  selector: 'okr-menu-info-modal',
  standalone: true,
  imports: [Header, IonContent],
  styles: [`
    .content { -webkit-user-select: text; user-select: text; line-height: 1.5; }
    .content ::ng-deep p { margin: 0 0 12px; }
    .content ::ng-deep ul, .content ::ng-deep ol { padding-left: 20px; margin: 0 0 12px; }
    .content ::ng-deep img { max-width: 100%; height: auto; }
  `],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <div class="content" [innerHTML]="html()"></div>
    </ion-content>
  `,
})
export class MenuInfoModal {
  /** the menu item's label, as the modal title */
  public readonly title = input('');
  /** the info, already translated if it was an i18n key */
  public readonly html = input.required<string>();
}
