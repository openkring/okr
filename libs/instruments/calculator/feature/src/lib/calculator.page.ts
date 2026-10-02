import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonLabel, IonMenuButton, IonSegment, IonSegmentButton, IonSelect,
  IonSelectOption, IonTitle, IonToggle, IonToolbar, ViewDidEnter, ViewWillLeave,
} from '@ionic/angular/standalone';

import { CalculatorBits, CalculatorDisplay, CalculatorKeypad, CalculatorTape } from '@okr/instruments-calculator-ui';
import {
  CALC_PROFILES, CalcProfile, keyFromKeyboard, PROG_BASES, ProgBase, UNIT_CATEGORIES, UnitCategoryId, unitI18nId,
  WORD_SIZES, WordSize,
} from '@okr/instruments-calculator-util';

import { CalculatorStore } from './calculator.store';

const BASE_LABELS: Record<ProgBase, string> = { 16: 'HEX', 10: 'DEC', 8: 'OCT', 2: 'BIN' };
const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'ION-INPUT', 'ION-TEXTAREA', 'ION-SELECT', 'ION-SEARCHBAR'];

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || EDITABLE_TAGS.includes(el.tagName));
}

/**
 * The Rechner page (spec 1.81). Profile segment + display + keypads, an optional history strip, and
 * document-level keyboard/paste handling that is active only while this page is shown.
 */
@Component({
  selector: 'okr-calculator-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CalculatorStore],
  imports: [
    CalculatorDisplay, CalculatorKeypad, CalculatorBits, CalculatorTape,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonButton, IonContent, IonSegment,
    IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonToggle,
  ],
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(document:paste)': 'onPaste($event)',
  },
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; max-width: 1200px; margin: 0 auto; padding: 1rem; }
    @media (min-width: 992px) { .layout.with-tape { grid-template-columns: minmax(0, 1fr) 280px; } }
    .calc { width: 100%; max-width: 420px; margin: 0 auto; display: flex; flex-direction: column; gap: 0.75rem; }
    .calc.wide { max-width: 900px; }
    .pads { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
    @media (min-width: 768px) { .pads.split { grid-template-columns: 6fr 4fr; } }
    .controls { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
    .controls ion-segment { max-width: 320px; }
    .units { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.5rem; align-items: center; }
    .output { text-align: right; font-size: 1.6rem; padding: 0 1rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .symbol { color: var(--ion-color-medium); font-size: 1rem; margin-left: 0.25rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          @if (profile() !== 'convert') {
            <ion-button [fill]="store.settings().rpn ? 'solid' : 'clear'" [title]="store.i18n.rpn_title()" (click)="store.toggleRpn()">RPN</ion-button>
          }
          <ion-button [fill]="showTape() ? 'solid' : 'clear'" (click)="showTape.set(!showTape())">{{ store.i18n.history_title() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="profile()" (ionChange)="onProfile($event.detail.value)">
          @for (p of profiles; track p) {
            <ion-segment-button [value]="p"><ion-label>{{ profileLabel(p) }}</ion-label></ion-segment-button>
          }
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="layout" [class.with-tape]="showTape()">
        <div class="calc" [class.wide]="profile() === 'scientific' || profile() === 'programmer'">
          @if (profile() === 'convert') {
            <ion-select [label]="store.i18n.convert_category()" interface="popover"
              [value]="store.settings().convertCategory" (ionChange)="onCategory($event.detail.value)">
              @for (c of categories; track c.id) {
                <ion-select-option [value]="c.id">{{ store.categoryI18n[c.id]() }}</ion-select-option>
              }
            </ion-select>
            <div class="units">
              <ion-select [label]="store.i18n.convert_from()" labelPlacement="stacked" interface="popover"
                [value]="store.settings().convertFrom" (ionChange)="onUnits($event.detail.value, store.settings().convertTo)">
                @for (u of unitOptions(); track u.id) { <ion-select-option [value]="u.id">{{ u.label }}</ion-select-option> }
              </ion-select>
              <ion-button fill="clear" [title]="store.i18n.convert_swap()" (click)="store.swapUnits()">⇄</ion-button>
              <ion-select [label]="store.i18n.convert_to()" labelPlacement="stacked" interface="popover"
                [value]="store.settings().convertTo" (ionChange)="onUnits(store.settings().convertFrom, $event.detail.value)">
                @for (u of unitOptions(); track u.id) { <ion-select-option [value]="u.id">{{ u.label }}</ion-select-option> }
              </ion-select>
            </div>
            <okr-calculator-display [main]="store.view().main" [chips]="[fromSymbol()]" [i18n]="store.i18n" (copied)="store.copy()" />
            <div class="output">= {{ store.convertOutput() }}<span class="symbol">{{ toSymbol() }}</span></div>
          } @else {
            <okr-calculator-display
              [main]="store.view().main" [stack]="store.view().stack" [chips]="store.chips()"
              [error]="store.view().error" [i18n]="store.i18n" (copied)="store.copy()" />
            @if (profile() === 'programmer') {
              <div class="controls">
                <ion-segment [value]="'' + store.settings().base" (ionChange)="onBase($event.detail.value)">
                  @for (b of bases; track b) {
                    <ion-segment-button [value]="'' + b"><ion-label>{{ baseLabels[b] }}</ion-label></ion-segment-button>
                  }
                </ion-segment>
                <ion-select [label]="store.i18n.wordSize()" interface="popover"
                  [value]="store.settings().wordSize" (ionChange)="onWordSize($event.detail.value)">
                  @for (w of wordSizes; track w) { <ion-select-option [value]="w">{{ w }} Bit</ion-select-option> }
                </ion-select>
                <ion-toggle [checked]="store.settings().signed" (ionChange)="store.setSigned($event.detail.checked)">
                  {{ store.i18n.signed() }}
                </ion-toggle>
              </div>
              <okr-calculator-bits [value]="store.programmerValue()" [wordSize]="store.settings().wordSize" (toggled)="store.toggleBit($event)" />
            }
          }
          <div class="pads" [class.split]="store.keypads().length > 1">
            @for (panel of store.keypads(); track $index) {
              <okr-calculator-keypad [keys]="panel.keys" [columns]="panel.columns" [disabled]="store.disabledKeys()" (pressed)="store.press($event)" />
            }
          </div>
        </div>
        @if (showTape()) {
          <okr-calculator-tape [entries]="store.history()" [i18n]="store.i18n" (picked)="store.pickHistory($event)" (cleared)="store.clearHistory()" />
        }
      </div>
    </ion-content>
  `,
})
export class CalculatorPage implements ViewDidEnter, ViewWillLeave {
  protected readonly store = inject(CalculatorStore);
  protected readonly profiles = CALC_PROFILES;
  protected readonly bases = PROG_BASES;
  protected readonly baseLabels = BASE_LABELS;
  protected readonly wordSizes = WORD_SIZES;
  protected readonly categories = UNIT_CATEGORIES;
  protected readonly showTape = signal(true);
  protected readonly profile = computed(() => this.store.settings().profile);

  protected readonly unitOptions = computed(() => {
    const category = this.store.settings().convertCategory;
    return this.store.convertUnits().map(u => {
      const name = this.store.unitI18n[unitI18nId(category, u.id)];
      return { id: u.id, label: `${name ? name() : u.id} (${u.symbol})` };
    });
  });
  protected readonly fromSymbol = computed(() => this.symbolOf(this.store.settings().convertFrom));
  protected readonly toSymbol = computed(() => this.symbolOf(this.store.settings().convertTo));

  private active = false;

  public ionViewDidEnter(): void {
    this.active = true;
  }

  public ionViewWillLeave(): void {
    this.active = false;
  }

  protected profileLabel(profile: CalcProfile): string {
    const labels = {
      basic: this.store.i18n.profile_basic, scientific: this.store.i18n.profile_scientific,
      programmer: this.store.i18n.profile_programmer, convert: this.store.i18n.profile_convert,
    };
    return labels[profile]();
  }

  protected onProfile(value: unknown): void {
    if (CALC_PROFILES.includes(value as CalcProfile)) this.store.setProfile(value as CalcProfile);
  }

  protected onBase(value: unknown): void {
    const base = Number(value);
    if (PROG_BASES.includes(base as ProgBase)) this.store.setBase(base as ProgBase);
  }

  protected onWordSize(value: unknown): void {
    const size = Number(value);
    if (WORD_SIZES.includes(size as WordSize)) this.store.setWordSize(size as WordSize);
  }

  protected onCategory(value: unknown): void {
    if (UNIT_CATEGORIES.some(c => c.id === value)) this.store.setConvertCategory(value as UnitCategoryId);
  }

  protected onUnits(from: unknown, to: unknown): void {
    if (typeof from === 'string' && typeof to === 'string') this.store.setConvertUnits(from, to);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.active || isEditableTarget(event.target)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      void this.store.copy();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = keyFromKeyboard(event.key, this.profile());
    if (key) {
      event.preventDefault();
      this.store.press(key);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    if (!this.active || isEditableTarget(event.target)) return;
    const text = event.clipboardData?.getData('text') ?? '';
    if (text) {
      event.preventDefault();
      this.store.paste(text);
    }
  }

  private symbolOf(unitId: string): string {
    return this.store.convertUnits().find(u => u.id === unitId)?.symbol ?? '';
  }
}
