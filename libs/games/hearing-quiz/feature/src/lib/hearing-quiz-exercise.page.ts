import { Component, HostListener, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonModal,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { confirm } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { HearingQuizAnswerCard, HearingQuizCardState, HearingQuizPlayButton } from '@okr/games-hearing-quiz-ui';
import { HQ_TREE_URL } from '@okr/games-hearing-quiz-util';

import { HearingQuizSessionStore } from './hearing-quiz-session.store';
import { HearingQuizPlayer } from './hearing-quiz.player';

/**
 * The exercise screen (spec §5) for one question (`/hearing-quiz/q/:nodeKey`) or a training
 * session (`/hearing-quiz/session/:folderKey`), plus the end-of-session summary (§6).
 *
 * One task per screen: the prompt, the play button, the answer cards. Nothing moves unless it means
 * something — the rings only while sound plays, the shake only on a wrong answer.
 */
@Component({
  selector: 'okr-hearing-quiz-exercise-page',
  standalone: true,
  providers: [HearingQuizSessionStore],
  imports: [
    SvgIconPipe, Spinner,
    HearingQuizPlayButton, HearingQuizAnswerCard,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonProgressBar, IonContent, IonFooter, IonNote, IonModal,
  ],
  styles: [`
    .hq-wrap { max-width: 960px; margin: 0 auto; padding: 8px 16px 24px; }
    .hq-prompt { font-size: 1.5rem; font-weight: 600; text-align: center; margin: 8px 0 0; }
    .hq-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 360px) { .hq-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 900px) { .hq-grid.many { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .hq-feedback { text-align: center; margin: 20px 0 0; font-size: 1.2rem; min-height: 3em; }
    .hq-feedback .ok { color: var(--ion-color-success-shade); font-weight: 600; }
    .hq-feedback small { display: block; color: var(--ion-color-medium-shade); font-size: 1rem; margin-top: 4px; }
    .hq-progress-text { font-variant-numeric: tabular-nums; padding: 0 12px; font-size: 1.1rem; }
    .hq-center { text-align: center; padding: 48px 16px; font-size: 1.2rem; }
    .hq-summary { max-width: 560px; margin: 0 auto; padding: 24px 16px; text-align: center; }
    .hq-summary h2 { font-size: 1.6rem; }
    .hq-counts { display: flex; justify-content: center; gap: 24px; margin: 24px 0; }
    .hq-counts div { display: flex; flex-direction: column; font-size: 1rem; }
    .hq-counts strong { font-size: 2.2rem; }
    .hq-missed { text-align: left; font-size: 1.1rem; }
    .hq-hint { padding: 16px 20px 32px; font-size: 1.2rem; line-height: 1.5; }
    .hq-hint img { display: block; max-width: 100%; max-height: 50vh; object-fit: contain; margin: 16px auto 0; }
    ion-footer ion-button { font-size: 1.1rem; min-height: 48px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="exit()">
            <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
            {{ i18n.exit() }}
          </ion-button>
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        @if (showProgress()) {
          <span slot="end" class="hq-progress-text" aria-live="polite">{{ progressLabel() }}</span>
        }
      </ion-toolbar>
      @if (showProgress()) {
        <ion-progress-bar [value]="progressValue()" />
      }
    </ion-header>

    <ion-content>
      @switch (store.status()) {
        @case ('loading') {
          <div class="hq-center"><okr-spinner /><p>{{ i18n.loading() }}</p></div>
        }
        @case ('notFound') {
          <div class="hq-center"><p>{{ i18n.not_found() }}</p>
            <ion-button (click)="backToList()">{{ i18n.back_to_list() }}</ion-button></div>
        }
        @case ('empty') {
          <div class="hq-center"><p>{{ i18n.empty_session() }}</p>
            <ion-button (click)="backToList()">{{ i18n.back_to_list() }}</ion-button></div>
        }
        @case ('done') {
          <div class="hq-summary" role="status">
            <h2>{{ i18n.summary_title() }}</h2>
            <div class="hq-counts">
              <div><strong>{{ store.score().correct }}</strong>{{ i18n.summary_correct() }}</div>
              <div><strong>{{ store.score().wrong }}</strong>{{ i18n.summary_wrong() }}</div>
              <div><strong>{{ store.score().skipped }}</strong>{{ i18n.summary_skipped() }}</div>
            </div>
            @if (store.missed().length > 0) {
              <p>{{ i18n.summary_missed() }}</p>
              <ul class="hq-missed">
                @for (q of store.missed(); track q.okey) { <li>{{ q.title }}</li> }
              </ul>
              <ion-button expand="block" (click)="store.practiceMissed()">{{ i18n.practice_missed() }}</ion-button>
            } @else {
              <p>{{ i18n.summary_all_correct() }}</p>
            }
            <ion-button expand="block" fill="outline" (click)="backToList()">{{ i18n.back_to_list() }}</ion-button>
          </div>
        }
        @case ('running') {
          @if (store.current(); as q) {
            <div class="hq-wrap">
              <p class="hq-prompt">{{ q.question }}</p>
              <okr-hearing-quiz-play-button
                [playing]="player.playing()" [level]="player.level()" [error]="player.error()"
                [playLabel]="i18n.play()" [playingLabel]="i18n.playing()" [errorLabel]="i18n.play_error()"
                (playClicked)="play()" />

              <div class="hq-grid" [class.many]="q.answers.length > 4">
                @for (answerIndex of store.order(); track answerIndex; let pos = $index) {
                  <okr-hearing-quiz-answer-card
                    [text]="q.answers[answerIndex].text" [caption]="q.answers[answerIndex].caption"
                    [imageUrl]="q.answers[answerIndex].imageUrl"
                    [state]="cardState(answerIndex)" [disabled]="!canAnswer()"
                    [keyHint]="'' + (pos + 1)" [ariaLabel]="q.answers[answerIndex].text"
                    (selected)="store.choose(answerIndex)" />
                }
              </div>

              <div class="hq-feedback" aria-live="polite">
                @if (store.isAnswered()) {
                  @if (store.isCorrect()) {
                    <span class="ok">{{ i18n.correct() }}</span>
                  } @else {
                    <span>{{ i18n.wrong() }}</span>
                  }
                  <small>{{ i18n.replay_invite() }}</small>
                } @else if (!player.hasPlayed() && !player.error()) {
                  <ion-note>{{ i18n.play_first() }}</ion-note>
                }
              </div>
            </div>

            <ion-modal [isOpen]="hintOpen()" [initialBreakpoint]="0.5" [breakpoints]="[0, 0.5, 1]" (didDismiss)="hintOpen.set(false)">
              <ng-template>
                <ion-content>
                  <div class="hq-hint">
                    @if (q.hint) { <p>{{ q.hint }}</p> }
                    @if (q.hintImageUrl) { <img [src]="q.hintImageUrl" alt="" /> }
                  </div>
                </ion-content>
              </ng-template>
            </ion-modal>
          }
        }
      }
    </ion-content>

    @if (store.status() === 'running' && store.current(); as q) {
      <ion-footer>
        <ion-toolbar>
          @if (q.hint || q.hintImageUrl) {
            <ion-buttons slot="start">
              <ion-button (click)="openHint()">
                <ion-icon slot="start" src="{{ 'bulb' | svgIcon }}" />
                {{ i18n.hint() }}
              </ion-button>
            </ion-buttons>
          }
          <ion-buttons slot="end">
            @if (store.isAnswered()) {
              <ion-button fill="solid" color="primary" (click)="store.next()">
                {{ store.isLast() ? i18n.finish() : i18n.next() }}
                <ion-icon slot="end" src="{{ 'arrow-forward' | svgIcon }}" />
              </ion-button>
            } @else {
              <ion-button (click)="store.skip()">
                {{ i18n.skip() }}
                <ion-icon slot="end" src="{{ 'chevron-forward' | svgIcon }}" />
              </ion-button>
            }
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    }
  `,
})
export class HearingQuizExercisePage implements OnDestroy {
  protected readonly store = inject(HearingQuizSessionStore);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  protected readonly i18n = this.store.i18n;
  protected readonly player = new HearingQuizPlayer();

  /** route params (withComponentInputBinding): exactly one of them is set */
  public readonly nodeKey = input<string>();
  public readonly folderKey = input<string>();

  protected readonly hintOpen = signal(false);

  protected readonly showProgress = computed(() => this.store.mode() === 'session' && this.store.status() === 'running');
  protected readonly progressLabel = computed(() => fill(this.i18n.progress(), { current: this.store.displayNumber(), total: this.store.total() }));
  protected readonly progressValue = computed(() => this.store.total() ? this.store.finishedCount() / this.store.total() : 0);
  protected readonly title = computed(() => {
    if (this.store.mode() === 'single') return this.store.current()?.title ?? this.i18n.title();
    return this.store.allNodes().find(n => n.okey === this.store.folderKey())?.title ?? this.i18n.title();
  });
  /** answers unlock once the clip has actually played (or cannot play at all) */
  protected readonly canAnswer = computed(() => !this.store.isAnswered() && (this.player.hasPlayed() || this.player.error()));

  constructor() {
    effect(() => {
      const nodeKey = this.nodeKey();
      const folderKey = this.folderKey();
      untracked(() => void this.store.load(nodeKey, folderKey));
    });
    // a new question on screen → load its clip (prefetched blob URL when available)
    effect(() => {
      const q = this.store.current();
      const position = this.store.position();
      untracked(() => {
        this.hintOpen.set(false);
        if (q && position >= 0) this.player.load(this.store.audioUrlOf(q));
      });
    });
  }

  public ngOnDestroy(): void {
    this.store.abort();
    this.player.destroy();
    this.store.destroy();
  }

  protected cardState(answerIndex: number): HearingQuizCardState {
    const q = this.store.current();
    if (!q || !this.store.isAnswered()) return 'idle';
    const chosen = this.store.chosen();
    if (answerIndex === chosen) return chosen === q.correctAnswer ? 'correct' : 'wrong';
    if (answerIndex === q.correctAnswer) return 'solution';
    return 'dimmed';
  }

  protected async play(): Promise<void> {
    if (this.player.hasPlayed()) this.store.countReplay();
    await this.player.play();
  }

  protected openHint(): void {
    this.store.markHintUsed();
    this.hintOpen.set(true);
  }

  protected async exit(): Promise<void> {
    const needsConfirm = this.store.status() === 'running' && this.store.mode() === 'session' && this.store.finishedCount() > 0;
    if (needsConfirm) {
      const ok = await confirm(this.alertController, this.i18n.exit_confirm(), this.i18n.exit_confirm_ok(), this.i18n.exit_confirm_cancel(), true);
      if (!ok) return;
    }
    await this.backToList();
  }

  protected async backToList(): Promise<void> {
    this.player.stop();
    await this.router.navigateByUrl(HQ_TREE_URL);
  }

  /** Keys 1–6 pick a card, Space plays (unless a button has focus — it handles Space itself). */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (this.store.status() !== 'running' || this.hintOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    if (event.key === ' ' && target?.tagName !== 'BUTTON') {
      event.preventDefault();
      void this.play();
      return;
    }
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= this.store.order().length && this.canAnswer()) {
      this.store.choose(this.store.order()[n - 1]);
    }
  }
}
