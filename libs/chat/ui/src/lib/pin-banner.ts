import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { ActivePin, MatrixChatI18n, PIN_ICON } from '@okr/chat-util';

/**
 * The pinned-message banner under the room header (spec 1.109 §6): 📌, «Sender: snippet» on one
 * line, the scope label («Für alle» / «Nur für dich») and «i von n» when there is more than one
 * pin. Tapping the text emits `jump`; the pin icon on the right emits `menu`.
 */
@Component({
  selector: 'okr-pin-banner',
  standalone: true,
  imports: [IonButton, IonIcon, SvgIconPipe],
  styles: [`
    :host {
      display: block;
      flex-shrink: 0;
      background: var(--ion-color-light, #f4f5f8);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
      color: var(--ion-text-color, #000);
    }
    .pin-banner {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 12px;
      min-height: 44px;
    }
    .pin-text {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .pin-glyph { flex-shrink: 0; }
    .pin-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .pin-line {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.9em;
    }
    .pin-sender { font-weight: 600; }
    .pin-meta {
      font-size: 0.75em;
      color: var(--ion-color-medium, #92949c);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  `],
  template: `
    <div class="pin-banner">
      <button type="button" class="pin-text" (click)="jump.emit()">
        <span class="pin-glyph" aria-hidden="true">📌</span>
        <span class="pin-body">
          <span class="pin-line">
            @if (senderName()) { <span class="pin-sender">{{ senderName() }}:</span> }
            {{ snippet() }}
          </span>
          <span class="pin-meta">{{ meta() }}</span>
        </span>
      </button>
      <ion-button fill="clear" size="small" [attr.aria-label]="i18n().as_title()" (click)="menu.emit()">
        <ion-icon slot="icon-only" src="{{ pinIcon | svgIcon }}" />
      </ion-button>
    </div>
  `,
})
export class PinBanner {
  /** The pin to show (the first of the active pins). */
  public readonly pin = input.required<ActivePin>();
  /** 1-based position of `pin` among the active pins. */
  public readonly index = input(1);
  /** Number of active pins in the room. */
  public readonly count = input(1);
  public readonly senderName = input('');
  public readonly snippet = input('');
  public readonly i18n = input.required<MatrixChatI18n>();

  public readonly jump = output<void>();
  public readonly menu = output<void>();

  protected readonly pinIcon = PIN_ICON;

  protected readonly meta = computed(() => {
    const i18n = this.i18n();
    const label = this.pin().scope === 'shared' ? i18n.pin_label_all() : i18n.pin_label_me();
    return this.count() > 1 ? `${label} · ${fill(i18n.pin_of(), { i: this.index(), n: this.count() })}` : label;
  });
}
