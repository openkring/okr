import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

/**
 * Dismissible error banner. Renders a danger-colored item with the given (already
 * translated) message and a close button. Place it directly under the page header
 * of list and edit views. It renders nothing when `message` is undefined/empty.
 *
 * Usage:
 *   <bk-error-banner [message]="store.errorMessage()" (dismiss)="store.clearError()" />
 */
@Component({
  selector: 'bk-error-banner',
  standalone: true,
  imports: [IonItem, IonLabel, IonButton, IonIcon, SvgIconPipe],
  template: `
    @if (message(); as message) {
      <ion-item lines="none" color="danger">
        <ion-icon slot="start" src="{{ 'alert-circle' | svgIcon }}" />
        <ion-label class="ion-text-wrap">{{ message }}</ion-label>
        <ion-button slot="end" fill="clear" color="light" (click)="dismiss.emit()">
          <ion-icon slot="icon-only" src="{{ 'close' | svgIcon }}" />
        </ion-button>
      </ion-item>
    }
  `
})
export class ErrorBanner {
  /** The already-translated, user-facing error message. */
  public message = input<string | undefined>(undefined);

  /** Emitted when the user dismisses the banner. */
  public dismiss = output<void>();
}
