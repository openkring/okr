// libs/content/pdf-template/feature/src/lib/mailing-segments.ts
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonLabel, IonSegment, IonSegmentButton, IonToolbar } from '@ionic/angular';

export type MailingSegment = 'overview' | 'letters';

/**
 * «Versandübersicht | Briefe» above the two lists of the Versand overview. Each segment is its own route
 * (`/mailings/all`, `/mailings/letters`), so a link or the back button still lands on the right list.
 */
@Component({
  selector: 'okr-mailing-segments',
  standalone: true,
  imports: [IonToolbar, IonSegment, IonSegmentButton, IonLabel],
  template: `
    <ion-toolbar>
      <ion-segment [value]="active()" (ionChange)="go($event.detail.value)">
        <ion-segment-button value="overview"><ion-label>{{ overviewLabel() }}</ion-label></ion-segment-button>
        <ion-segment-button value="letters"><ion-label>{{ lettersLabel() }}</ion-label></ion-segment-button>
      </ion-segment>
    </ion-toolbar>
  `,
})
export class MailingSegments {
  private readonly router = inject(Router);

  public readonly active = input.required<MailingSegment>();
  public readonly overviewLabel = input.required<string>();
  public readonly lettersLabel = input.required<string>();

  protected async go(value: unknown): Promise<void> {
    if (value === this.active()) return;
    await this.router.navigate(['/mailings', value === 'letters' ? 'letters' : 'all']);
  }
}
