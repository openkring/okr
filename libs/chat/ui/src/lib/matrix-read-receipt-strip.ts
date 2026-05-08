import { Component, computed, input, signal } from '@angular/core';
import { IonAvatar, IonItem, IonLabel, IonList, IonPopover } from '@ionic/angular/standalone';

import { MatrixReadReceipt } from '@bk2/shared-models';
import { buildReceiptAriaLabel, hashUserIdToColor, formatReceiptTime } from '@bk2/chat-util';

@Component({
  selector: 'bk-matrix-read-receipt-strip',
  standalone: true,
  imports: [IonPopover, IonList, IonItem, IonLabel, IonAvatar],
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
  },
  styles: [`
    :host {
      display: flex;
      justify-content: flex-end;
      margin-top: 2px;
    }

    .receipt-strip {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .receipt-avatar {
      width: 18px;
      height: 18px;
      margin-left: -4px;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid var(--ion-background-color, #fff);
      flex-shrink: 0;
    }

    .receipt-avatar:first-child {
      margin-left: 0;
    }

    .receipt-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .receipt-initial {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 600;
      color: #fff;
    }

    .receipt-overflow {
      font-size: 0.65rem;
      color: var(--ion-color-medium);
      margin-left: 3px;
    }

    .popover-avatar-img {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
    }

    .popover-initial {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: #fff;
    }

    .popover-name {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .popover-time {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <div class="receipt-strip" (click)="openPopover($event)">
      @for (r of visibleReceipts(); track r.userId) {
        <div class="receipt-avatar">
          @if (r.avatarUrl) {
            <img [src]="r.avatarUrl" [alt]="r.displayName" />
          } @else {
            <div class="receipt-initial" [style.background-color]="color(r.userId)">
              {{ r.displayName.charAt(0).toUpperCase() }}
            </div>
          }
        </div>
      }
      @if (overflowCount() > 0) {
        <span class="receipt-overflow">+{{ overflowCount() }}</span>
      }
    </div>

    <ion-popover
      [isOpen]="popoverOpen()"
      [event]="popoverEvent()"
      (didDismiss)="popoverOpen.set(false)"
    >
      <ng-template>
        <ion-list lines="none">
          @for (r of receipts(); track r.userId) {
            <ion-item>
              <ion-avatar slot="start">
                @if (r.avatarUrl) {
                  <img [src]="r.avatarUrl" [alt]="r.displayName" class="popover-avatar-img" />
                } @else {
                  <div class="popover-initial" [style.background-color]="color(r.userId)">
                    {{ r.displayName.charAt(0).toUpperCase() }}
                  </div>
                }
              </ion-avatar>
              <ion-label>
                <p class="popover-name">{{ r.displayName }}</p>
                <p class="popover-time">{{ formatTime(r.ts) }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </ng-template>
    </ion-popover>
  `,
})
export class MatrixReadReceiptStrip {
  public receipts = input<MatrixReadReceipt[]>([]);

  protected readonly popoverOpen = signal(false);
  protected readonly popoverEvent = signal<Event | undefined>(undefined);

  protected readonly visibleReceipts = computed(() => this.receipts().slice(0, 4));
  protected readonly overflowCount = computed(() => Math.max(0, this.receipts().length - 4));
  protected readonly ariaLabel = computed(() => buildReceiptAriaLabel(this.receipts()));

  protected openPopover(event: Event): void {
    this.popoverEvent.set(event);
    this.popoverOpen.set(true);
  }

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  protected formatTime(ts: number): string {
    return formatReceiptTime(ts);
  }
}
