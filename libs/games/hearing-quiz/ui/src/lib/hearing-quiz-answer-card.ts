import { Component, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';

/**
 * `idle` before answering; afterwards the chosen card is `correct` or `wrong`, the right card
 * (if not chosen) is `solution`, every other card is `dimmed`.
 */
export type HearingQuizCardState = 'idle' | 'correct' | 'wrong' | 'solution' | 'dimmed';

/**
 * One large answer card (spec §5.3/§5.4). Feedback is visual only and deliberately gentle: a soft
 * green border fading in for right, grey plus a short small shake for wrong — no sound, no red
 * flash. Right/wrong also carry an icon, so the feedback never depends on colour alone.
 */
@Component({
  selector: 'okr-hearing-quiz-answer-card',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardContent, IonIcon],
  styles: [`
    :host { display: block; height: 100%; }
    button { all: unset; display: block; width: 100%; height: 100%; cursor: pointer; border-radius: 16px; }
    button:focus-visible { outline: 4px solid var(--ion-color-warning); outline-offset: 2px; }
    button[disabled] { cursor: default; }
    ion-card {
      margin: 0; height: 100%; min-height: 104px; border-radius: 16px;
      border: 3px solid var(--ion-color-step-200, #ccc); box-shadow: none;
      transition: border-color 400ms ease, opacity 300ms ease, background-color 300ms ease;
    }
    ion-card-content { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; position: relative; }
    .hq-text { font-family: Inter, Arial, sans-serif; font-size: 2rem; line-height: 1.2; font-weight: 600; color: var(--ion-text-color); overflow-wrap: anywhere; }
    .hq-caption { font-size: 1rem; color: var(--ion-color-medium-shade); }
    .hq-image { max-width: 100%; max-height: 120px; object-fit: contain; }
    .hq-badge { position: absolute; top: 8px; right: 8px; font-size: 28px; }
    .correct ion-card, .solution ion-card { border-color: var(--ion-color-success); }
    .correct ion-card { background: rgba(var(--ion-color-success-rgb), 0.08); }
    .wrong ion-card { border-color: var(--ion-color-medium); background: var(--ion-color-light); opacity: 0.8; animation: hq-shake 300ms ease-in-out; }
    .dimmed ion-card { opacity: 0.5; }
    .hq-key { position: absolute; top: 8px; left: 12px; font-size: 0.85rem; color: var(--ion-color-medium); }
    @keyframes hq-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }
    @media (prefers-reduced-motion: reduce) { .wrong ion-card { animation: none; } }
  `],
  template: `
    <button type="button" [class]="state()" [disabled]="disabled()" [attr.aria-label]="ariaLabel()" (click)="selected.emit()">
      <ion-card>
        <ion-card-content>
          @if (keyHint()) { <span class="hq-key" aria-hidden="true">{{ keyHint() }}</span> }
          @if (state() === 'correct' || state() === 'solution') {
            <ion-icon class="hq-badge" color="success" src="{{ 'checkbox-circle' | svgIcon }}" />
          } @else if (state() === 'wrong') {
            <ion-icon class="hq-badge" color="medium" src="{{ 'cancel-circle' | svgIcon }}" />
          }
          @if (imageUrl()) { <img class="hq-image" [src]="imageUrl()" alt="" /> }
          <span class="hq-text">{{ text() }}</span>
          @if (caption()) { <span class="hq-caption">{{ caption() }}</span> }
        </ion-card-content>
      </ion-card>
    </button>
  `,
})
export class HearingQuizAnswerCard {
  public readonly text = input.required<string>();
  public readonly caption = input('');
  public readonly imageUrl = input('');
  public readonly state = input<HearingQuizCardState>('idle');
  public readonly disabled = input(false);
  public readonly keyHint = input('');
  public readonly ariaLabel = input('');

  public readonly selected = output<void>();
}
