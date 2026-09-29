import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCol,
  IonContent,
  IonGrid,
  IonNote,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { copyToClipboard } from '@okr/shared-util-angular';
import { WORDLE_LENGTHS, WORDLE_TRIES, WordleMode } from '@okr/games-wordle-util';

import { WordleStore } from './wordle.store';

/** On-screen keyboard, QWERTZ like the keyboards our members type on. */
const KEY_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Y', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

/** How long a notice (too short, copied, …) stays under the board. */
const NOTICE_MS = 2200;

/**
 * The Wordle board: guess the word in a limited number of tries.
 *
 * Input comes from the on-screen keyboard and from a physical keyboard alike. The physical one
 * listens on `document`, so it is switched off while Ionic keeps this page alive behind another
 * one (`ionViewWillLeave`) and while focus sits in a text field or an open overlay — typing into
 * the select popovers must not land on the board. A focused control only keeps Enter.
 */
@Component({
  selector: 'okr-wordle-page',
  standalone: true,
  providers: [WordleStore],
  imports: [
    Header,
    IonContent, IonCard, IonCardContent, IonGrid, IonRow, IonCol,
    IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonButton, IonNote,
  ],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content class="ion-padding">
      <ion-card class="wd-card">
        <ion-card-content>

          <ion-segment [value]="store.config().mode" (ionChange)="setMode($event.detail.value)">
            <ion-segment-button value="daily"><ion-label>{{ store.i18n.mode_daily() }}</ion-label></ion-segment-button>
            <ion-segment-button value="endless"><ion-label>{{ store.i18n.mode_endless() }}</ion-label></ion-segment-button>
          </ion-segment>

          <ion-grid class="ion-no-padding">
            <ion-row>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.length_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [value]="store.config().length"
                  (ionChange)="store.setLength($any($event.detail.value))">
                  @for (length of lengths; track length) {
                    <ion-select-option [value]="length">{{ length }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
              <ion-col size="6">
                <ion-select
                  [label]="store.i18n.tries_label()"
                  labelPlacement="stacked"
                  interface="popover"
                  [value]="store.config().maxTries"
                  (ionChange)="store.setTries($any($event.detail.value))">
                  @for (tries of triesOptions; track tries) {
                    <ion-select-option [value]="tries">{{ tries }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
            </ion-row>
          </ion-grid>

          <p class="wd-desc">{{ store.i18n.desc() }}</p>

          <div class="wd-board" [style.--wd-len]="store.game().length">
            @for (row of store.rows(); track $index) {
              <div class="wd-row" [class.shake]="row.current && shaking()">
                @for (letter of row.letters; track $index) {
                  <div
                    class="wd-cell"
                    [class.filled]="letter !== ''"
                    [class]="row.states ? row.states[$index] : ''"
                    [style.--wd-i]="$index">
                    {{ letter }}
                  </div>
                }
              </div>
            }
          </div>

          <div class="wd-status" role="status">
            @if (store.status() === 'won') {
              <div class="wd-result won">
                <span class="wd-result-title">{{ store.i18n.won() }}</span>
                <span>{{ store.wonDetail() }}</span>
              </div>
            } @else if (store.status() === 'lost') {
              <div class="wd-result lost">
                <span class="wd-result-title">{{ store.i18n.lost() }}</span>
                <span>{{ store.lostDetail() }}</span>
              </div>
            }
            @if (store.noticeLabel()) {
              <ion-note [color]="store.notice() === 'too-short' ? 'danger' : undefined">{{ store.noticeLabel() }}</ion-note>
            } @else if (store.status() !== 'playing' && store.config().mode === 'daily') {
              <ion-note>{{ store.i18n.daily_done() }}</ion-note>
            }
          </div>

          @if (store.status() === 'playing') {
            <div class="wd-keyboard">
              @for (keys of keyRows; track $index) {
                <div class="wd-keys">
                  @for (key of keys; track key) {
                    @switch (key) {
                      @case ('ENTER') {
                        <button type="button" class="wd-key wide" (click)="store.submit()">{{ store.i18n.enter() }}</button>
                      }
                      @case ('BACK') {
                        <button type="button" class="wd-key wide" [attr.aria-label]="store.i18n.backspace()" (click)="store.backspace()">⌫</button>
                      }
                      @default {
                        <button type="button" class="wd-key" [class]="store.keys()[key] ?? ''" (click)="store.type(key)">{{ key }}</button>
                      }
                    }
                  }
                </div>
              }
            </div>
          } @else {
            <div class="wd-actions">
              <ion-button fill="outline" (click)="share()">{{ store.i18n.share() }}</ion-button>
              @if (store.config().mode === 'endless') {
                <ion-button fill="solid" (click)="store.nextWord()">{{ store.i18n.next_word() }}</ion-button>
              }
            </div>
          }

        </ion-card-content>
      </ion-card>

      <ion-card class="wd-card">
        <ion-card-content>
          <h2 class="wd-stats-title">{{ store.i18n.stats_title() }}</h2>
          <div class="wd-stats">
            <span><b>{{ store.stats().played }}</b><small>{{ store.i18n.stats_played() }}</small></span>
            <span><b>{{ store.winRate() }}</b><small>{{ store.i18n.stats_winrate() }}</small></span>
            <span><b>{{ store.streak() }}</b><small>{{ store.i18n.stats_streak() }}</small></span>
            <span><b>{{ store.stats().maxStreak }}</b><small>{{ store.i18n.stats_max_streak() }}</small></span>
          </div>
          <h3 class="wd-dist-title">{{ store.i18n.stats_dist() }}</h3>
          <div class="wd-dist">
            @for (bar of store.dist(); track bar.tries) {
              <div class="wd-dist-row">
                <span class="wd-dist-label">{{ bar.tries }}</span>
                <span
                  class="wd-dist-bar"
                  [class.latest]="store.status() === 'won' && store.game().guesses.length === bar.tries"
                  [style.width.%]="8 + bar.share * 92">{{ bar.count }}</span>
              </div>
            }
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    .wd-card { max-width: 32rem; margin-inline: auto; }
    .wd-desc { color: var(--ion-color-medium); font-size: 0.85rem; margin: 0.5rem 0 1rem; }
    ion-segment { margin-bottom: 0.5rem; }

    .wd-board {
      display: grid;
      gap: 0.35rem;
      width: min(100%, calc(var(--wd-len) * 3.6rem));
      margin-inline: auto;
    }
    .wd-row { display: grid; grid-template-columns: repeat(var(--wd-len), 1fr); gap: 0.35rem; }
    .wd-row.shake { animation: wd-shake 0.4s; }

    .wd-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      border: 2px solid var(--ion-color-light-shade);
      border-radius: 0.3rem;
      font-weight: 700;
      font-size: clamp(1.1rem, 6vw, 1.8rem);
      text-transform: uppercase;
      user-select: none;
    }
    .wd-cell.filled { border-color: var(--ion-color-medium); }
    .wd-cell.correct, .wd-cell.present, .wd-cell.absent {
      animation: wd-flip 0.45s both;
      animation-delay: calc(var(--wd-i) * 90ms);
    }
    .wd-cell.correct { background: var(--ion-color-success); border-color: var(--ion-color-success); color: var(--ion-color-success-contrast); }
    .wd-cell.present { background: var(--ion-color-warning); border-color: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .wd-cell.absent { background: var(--ion-color-medium); border-color: var(--ion-color-medium); color: var(--ion-color-medium-contrast); }

    .wd-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      min-height: 2.25rem;
      margin: 0.75rem 0 0.5rem;
      font-size: 0.9rem;
      text-align: center;
    }
    .wd-result { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.4rem 0.75rem; border-radius: 0.5rem; }
    .wd-result.won { background: var(--ion-color-success-tint); color: var(--ion-color-success-contrast); }
    .wd-result.lost { background: var(--ion-color-light); color: var(--ion-color-dark); }
    .wd-result-title { font-weight: 700; }

    .wd-keyboard { display: grid; gap: 0.35rem; margin-top: 0.5rem; touch-action: manipulation; }
    .wd-keys { display: flex; gap: 0.25rem; justify-content: center; }
    .wd-key {
      flex: 1 1 0;
      min-width: 0;
      max-width: 2.6rem;
      height: 3.2rem;
      padding: 0;
      border: 0;
      border-radius: 0.3rem;
      background: var(--ion-color-light-shade);
      color: var(--ion-color-dark);
      font: inherit;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
    }
    .wd-key.wide { flex: 1.6 1 0; max-width: 4.4rem; font-size: 0.75rem; }
    .wd-key.correct { background: var(--ion-color-success); color: var(--ion-color-success-contrast); }
    .wd-key.present { background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .wd-key.absent { background: var(--ion-color-medium); color: var(--ion-color-medium-contrast); }

    .wd-actions { display: flex; gap: 0.5rem; justify-content: center; }

    .wd-stats-title { margin: 0 0 0.75rem; font-size: 1.05rem; font-weight: 700; }
    .wd-stats { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; }
    .wd-stats span { display: flex; flex-direction: column; }
    .wd-stats b { font-size: 1.5rem; font-variant-numeric: tabular-nums; }
    .wd-stats small { color: var(--ion-color-medium); font-size: 0.75rem; }
    .wd-dist-title { margin: 1rem 0 0.5rem; font-size: 0.9rem; font-weight: 700; }
    .wd-dist { display: grid; gap: 0.25rem; }
    .wd-dist-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
    .wd-dist-label { width: 1.2rem; text-align: right; font-variant-numeric: tabular-nums; }
    .wd-dist-bar {
      padding: 0.1rem 0.4rem;
      text-align: right;
      background: var(--ion-color-medium);
      color: var(--ion-color-medium-contrast);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .wd-dist-bar.latest { background: var(--ion-color-success); color: var(--ion-color-success-contrast); }

    @keyframes wd-flip {
      0% { transform: rotateX(90deg); }
      100% { transform: rotateX(0); }
    }
    @keyframes wd-shake {
      20%, 60% { transform: translateX(-4px); }
      40%, 80% { transform: translateX(4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .wd-cell.correct, .wd-cell.present, .wd-cell.absent, .wd-row.shake { animation: none; }
    }
  `],
})
export class WordlePage {
  protected readonly store = inject(WordleStore);

  protected readonly lengths = WORDLE_LENGTHS;
  protected readonly triesOptions = WORDLE_TRIES;
  protected readonly keyRows = KEY_ROWS;

  /** True for the length of one shake after a refused submission. */
  protected readonly shaking = signal(false);

  /** False while Ionic keeps the page in its stack behind another one. */
  private active = true;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private shakeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // A notice clears itself; a new notice restarts the timer.
    effect(() => {
      const notice = this.store.notice();
      clearTimeout(this.noticeTimer);
      if (notice) this.noticeTimer = setTimeout(() => this.store.notify(null), NOTICE_MS);
    });

    // Each refused submission bumps `shake`; replay the animation for it.
    effect(() => {
      if (this.store.shake() === 0) return;
      this.shaking.set(false);
      clearTimeout(this.shakeTimer);
      // Re-adding the class on the next task restarts the CSS animation.
      this.shakeTimer = setTimeout(() => {
        this.shaking.set(true);
        this.shakeTimer = setTimeout(() => this.shaking.set(false), 400);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.noticeTimer);
      clearTimeout(this.shakeTimer);
    });
  }

  public ionViewWillEnter(): void {
    this.active = true;
    this.store.refreshDay();
  }

  public ionViewWillLeave(): void {
    this.active = false;
  }

  protected onVisibility(): void {
    if (document.visibilityState === 'visible') this.store.refreshDay();
  }

  protected setMode(value: unknown): void {
    if (value === 'daily' || value === 'endless') this.store.setMode(value as WordleMode);
  }

  /** Copies straight from the click — no await before it, or Safari drops the user gesture. */
  protected share(): void {
    copyToClipboard(this.store.shareText())
      .then(() => this.store.notify('copied'))
      .catch(() => undefined);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.active || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    // Text fields and open overlays (the select popovers) keep every key.
    if (target?.closest('input, textarea, select, ion-popover, [contenteditable="true"]')) return;
    // A focused control (the length select after a change, the share button, …) still lets
    // letters through to the board, but keeps Enter — that is how it opens or activates.
    // On-screen keys are the exception: there Enter submits (and preventDefault stops the
    // focused key from also being clicked).
    const onControl = !!target?.closest('button, ion-button, ion-select, ion-segment') && !target?.closest('.wd-keyboard');

    if (event.key === 'Enter') {
      if (onControl) return;
      event.preventDefault();
      this.store.submit();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.store.backspace();
    } else if (event.key.length === 1 && /[a-zäöüß]/i.test(event.key)) {
      event.preventDefault();
      this.store.type(event.key);
    }
  }
}
