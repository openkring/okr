import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonButton, IonCard, IonCardContent, IonIcon } from '@ionic/angular';

import { COUNTER_CONFIG_SHAPE, CounterConfig, CounterSection } from '@okr/shared-models';
import { OptionalCardHeader } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';

import { SectionStore } from './section.store';

/**
 * A number the visitor counts up and down, or that ticks by itself (`isAuto`). Four looks share
 * one count: `display` (big number), `stepper` (compact − n +), `flip` (flip-board digit tiles)
 * and `ring` (number in a circle, buttons either side).
 *
 * The count is local to the viewer and starts at 0 on every render; nothing is persisted.
 * Successor of the demo `okr-counter` in shared-ui, with the same tick-by-interval approach but
 * a timer that is torn down with the component.
 */
@Component({
  selector: 'okr-counter-section',
  standalone: true,
  imports: [NgTemplateOutlet, SvgIconPipe, OptionalCardHeader, IonCard, IonCardContent, IonButton, IonIcon],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    .counter { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 0px; }
    .caption { font-size: 1rem; color: var(--ion-color-medium); text-align: center; }
    .value { font-variant-numeric: tabular-nums; font-weight: 700; line-height: 1; color: var(--ion-text-color); }
    .buttons { display: flex; gap: 12px; justify-content: center; }

    /* display */
    .display .value { font-size: clamp(4rem, 18vw, 10rem); }

    /* stepper */
    .stepper .row {
      display: flex; align-items: center; gap: 8px;
      border: 1px solid var(--ion-color-medium); border-radius: 999px; padding: 4px;
    }
    .stepper .value { font-size: 2rem; min-width: 3ch; text-align: center; }

    /* flip */
    .flip .tiles { display: flex; gap: 6px; }
    .flip .tile {
      position: relative; display: flex; align-items: center; justify-content: center;
      width: clamp(2.5rem, 12vw, 4.5rem); height: clamp(3.5rem, 17vw, 6.5rem);
      border-radius: 8px; background: var(--ion-color-dark); color: var(--ion-color-dark-contrast);
      font-size: clamp(2rem, 10vw, 4rem); font-weight: 700; font-variant-numeric: tabular-nums;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      animation: flip-in 0.25s ease-out;
    }
    .flip .tile::after {
      content: ''; position: absolute; left: 0; right: 0; top: 50%;
      height: 2px; background: rgba(0, 0, 0, 0.45);
    }
    @keyframes flip-in { from { transform: rotateX(80deg); } to { transform: rotateX(0deg); } }
    @media (prefers-reduced-motion: reduce) { .flip .tile { animation: none; } }

    /* ring */
    .ring .row { display: flex; align-items: center; gap: 16px; }
    .ring .circle {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: clamp(10rem, 45vw, 14rem); aspect-ratio: 1; border-radius: 50%;
      border: 10px solid var(--ion-color-primary);
    }
    .ring .value { font-size: clamp(2.5rem, 12vw, 4rem); }
    .ring .caption { max-width: 80%; }
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="section.title" [subTitle]="section.subTitle" />
        <ion-card-content>
          <div class="counter" [class]="config().uiType" role="group" [attr.aria-label]="ariaLabel()">
            @switch(config().uiType) {
              @case('stepper') {
                @if(config().label) { <span class="caption">{{ config().label }}</span> }
                <div class="row">
                  @if(config().showDownButton) { <ng-container *ngTemplateOutlet="down; context: { fill: 'clear' }" /> }
                  <span class="value" [attr.aria-live]="live()">{{ count() }}</span>
                  @if(config().showUpButton) { <ng-container *ngTemplateOutlet="up; context: { fill: 'clear' }" /> }
                </div>
              }
              @case('flip') {
                <div class="tiles" [attr.aria-live]="live()" [attr.aria-label]="count()">
                  @for(char of digits(); track $index + char) {
                    <span class="tile" aria-hidden="true">{{ char }}</span>
                  }
                </div>
                @if(config().label) { <span class="caption">{{ config().label }}</span> }
                <ng-container *ngTemplateOutlet="buttons" />
              }
              @case('ring') {
                <div class="row">
                  @if(config().showDownButton) { <ng-container *ngTemplateOutlet="down; context: { fill: 'outline' }" /> }
                  <div class="circle">
                    <span class="value" [attr.aria-live]="live()">{{ count() }}</span>
                    @if(config().label) { <span class="caption">{{ config().label }}</span> }
                  </div>
                  @if(config().showUpButton) { <ng-container *ngTemplateOutlet="up; context: { fill: 'outline' }" /> }
                </div>
              }
              @default {
                <span class="value" [attr.aria-live]="live()">{{ count() }}</span>
                @if(config().label) { <span class="caption">{{ config().label }}</span> }
                <ng-container *ngTemplateOutlet="buttons" />
              }
            }
          </div>
        </ion-card-content>
      </ion-card>
    }

    <ng-template #buttons>
      <div class="buttons">
        @if(config().showDownButton) { <ng-container *ngTemplateOutlet="down; context: { fill: 'solid' }" /> }
        @if(config().showUpButton) { <ng-container *ngTemplateOutlet="up; context: { fill: 'solid' }" /> }
      </div>
    </ng-template>

    <ng-template #down let-fill="fill">
      <ion-button [fill]="fill" shape="round" (click)="step(-1)" [attr.aria-label]="store.i18n.counter_down()">
        <ion-icon [slot]="config().showButtonLabels ? 'start' : 'icon-only'" src="{{ 'remove' | svgIcon }}" />
        @if(config().showButtonLabels) { {{ store.i18n.counter_down() }} }
      </ion-button>
    </ng-template>

    <ng-template #up let-fill="fill">
      <ion-button [fill]="fill" shape="round" (click)="step(1)" [attr.aria-label]="store.i18n.counter_up()">
        <ion-icon [slot]="config().showButtonLabels ? 'start' : 'icon-only'" src="{{ 'add' | svgIcon }}" />
        @if(config().showButtonLabels) { {{ store.i18n.counter_up() }} }
      </ion-button>
    </ng-template>
  `
})
export class CounterSectionComponent {
  protected readonly store = inject(SectionStore);

  // inputs
  public section = input<CounterSection>();

  // state
  protected readonly count = signal(0);

  // derived values
  /** Legacy or hand-edited documents may lack fields; the shape fills them in. */
  protected readonly config = computed<CounterConfig>(() => ({ ...COUNTER_CONFIG_SHAPE, ...this.section()?.properties }));
  protected readonly digits = computed(() => String(this.count()).split(''));
  protected readonly ariaLabel = computed(() => this.config().label || this.section()?.title || this.store.i18n.counter_region());
  /** Announce manual changes only: an auto counter would flood a screen reader every tick. */
  protected readonly live = computed(() => (this.config().isAuto ? 'off' : 'polite'));

  constructor() {
    // the auto ticker; onCleanup stops the old timer when the config changes and on destroy
    effect((onCleanup) => {
      const { isAuto, autoInterval, autoDirection } = this.config();
      if (!isAuto || !(autoInterval > 0)) return;
      const delta = autoDirection === 'down' ? -1 : 1;
      const timer = setInterval(() => this.step(delta), autoInterval);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected step(delta: number): void {
    this.count.update((c) => c + delta);
  }
}
