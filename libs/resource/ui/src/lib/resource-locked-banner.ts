import { Component, input } from '@angular/core';
import { IonLabel, IonToolbar } from '@ionic/angular';

/**
 * Red bar under the avatar toolbar of the resource modal while a boat is locked (an active
 * 'maintenance' / 'blocked' reservation). The reason may span several lines (tripAlert is a
 * textarea), hence the inner block span: `.ion-text-wrap` would override a pre-line on the label.
 */
@Component({
  selector: 'okr-resource-locked-banner',
  standalone: true,
  imports: [IonToolbar, IonLabel],
  styles: [`
    ion-label { padding: 8px 16px; }
    .reason { display: block; white-space: pre-line; margin-top: 4px; }
  `],
  template: `
    <ion-toolbar color="danger">
      <ion-label class="ion-text-wrap">
        <strong>{{ title() }}</strong>
        @if(reason()) {
          <span class="reason">{{ reason() }}</span>
        }
      </ion-label>
    </ion-toolbar>
  `
})
export class ResourceLockedBanner {
  public readonly title = input.required<string>();
  public readonly reason = input('');
}
