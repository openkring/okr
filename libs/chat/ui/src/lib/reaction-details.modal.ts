import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonAvatar, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { formatMatrixTime, hashUserIdToColor } from '@okr/chat-util';

export interface ReactionDetailRow {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  ts: number;
}

/**
 * «Who reacted» bottom sheet for one reaction chip (spec 1.109 §4). Presentational: dismisses
 * with role `remove` (own reaction) or `add` (react the same way); the feature does the toggle.
 */
@Component({
  selector: 'okr-reaction-details-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonAvatar, IonIcon, SvgIconPipe],
  styles: [`
    .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .avatar-initial {
      width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 600; color: #fff;
    }
    .row-time { font-size: 0.75rem; color: var(--ion-color-medium); }
    .emoji { font-size: 1.3rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title><span class="emoji">{{ emoji() }}</span> · {{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [attr.aria-label]="closeLabel()" (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list lines="none">
        @for (r of sortedRows(); track r.userId) {
          <ion-item>
            <ion-avatar slot="start">
              @if (r.avatarUrl) {
                <img class="avatar-img" [src]="r.avatarUrl" [alt]="r.displayName" />
              } @else {
                <div class="avatar-initial" [style.background-color]="color(r.userId)">{{ r.displayName.charAt(0).toUpperCase() }}</div>
              }
            </ion-avatar>
            <ion-label>
              <h3>{{ r.userId === currentUserId() ? youText() : r.displayName }}</h3>
              <p class="row-time">{{ formatTime(r.ts) }}</p>
            </ion-label>
            @if (r.userId === currentUserId()) {
              <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="removeLabel()" (click)="dismiss('remove')">
                <ion-icon slot="icon-only" src="{{ 'remove-circle' | svgIcon }}" />
              </ion-button>
            }
          </ion-item>
        }
        @if (!hasOwn()) {
          <ion-item button detail="false" (click)="dismiss('add')">
            <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
            <ion-label>{{ alsoLabel() }}</ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class ReactionDetailsModal {
  private readonly modalController = inject(ModalController);

  public readonly emoji = input.required<string>();
  public readonly rows = input.required<ReactionDetailRow[]>();
  public readonly currentUserId = input<string | undefined>(undefined);
  /** «{n} Personen» */
  public readonly peopleLabel = input.required<string>();
  /** «Auch so reagieren» */
  public readonly alsoLabel = input.required<string>();
  public readonly closeLabel = input.required<string>();
  /** «du» — shown capitalised for the current user */
  public readonly youLabel = input.required<string>();
  public readonly removeLabel = input<string>('');

  protected readonly title = computed(() => fill(this.peopleLabel(), { n: this.rows().length }));
  protected readonly youText = computed(() => this.youLabel().charAt(0).toUpperCase() + this.youLabel().slice(1));
  protected readonly hasOwn = computed(() => this.rows().some((r) => r.userId === this.currentUserId()));
  /** newest first, the current user always on top */
  protected readonly sortedRows = computed(() => {
    const me = this.currentUserId();
    return [...this.rows()].sort((a, b) =>
      (a.userId === me ? -1 : 0) - (b.userId === me ? -1 : 0) || b.ts - a.ts);
  });

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  protected formatTime(ts: number): string {
    return `${new Date(ts).toLocaleDateString('de-CH')} ${formatMatrixTime(ts)}`;
  }

  protected close(): void {
    void this.modalController.dismiss(undefined, 'cancel');
  }

  protected dismiss(role: 'remove' | 'add'): void {
    void this.modalController.dismiss(undefined, role);
  }
}
