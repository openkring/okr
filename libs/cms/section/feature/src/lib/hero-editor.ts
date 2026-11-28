import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { historyKey, PlainEditable } from '@okr/cms-article-feature';
import { HeroPanel, HeroPanelPart, SECTION_PANEL_FIELDS, SectionPanel } from '@okr/cms-section-ui';
import {
  addHeroCta, ARTICLE_EDITOR_I18N_KEYS, createHistory, HERO_EDITOR_I18N_KEYS, HERO_MAX_CTAS, heroBackgroundStyle, heroCtasOf, heroHasCover,
  heroHasLogo, heroHeightCss, heroImgixParams, heroLogoStyle, heroObjectPosition, heroSectionValidations, moveHeroCtaForward, record, redo, restErrors,
  SECTION_I18N_KEYS, undo, type ArticlePreviewDevice, type EditorHistory, type HeroEditorI18n, type SectionErrors,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, HeroConfig, HeroSection, IMAGE_STYLE_SHAPE, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, Img } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';

type Selection = 'section' | HeroPanelPart;
type Device = Exclude<ArticlePreviewDevice, 'auto'>;
const DEVICES: readonly Device[] = ['mobile', 'tablet', 'desktop'];
const DEVICE_WIDTHS: Record<Device, string> = { mobile: '390px', tablet: '768px', desktop: '100%' };
/** the error names each part's panel shows at a field */
const PART_FIELDS: Record<HeroPanelPart, readonly string[]> = {
  cover: ['hero.', 'height', 'focus', 'gradient.', 'imgIxParams'],
  logo: ['logo.', 'width', 'border', 'borderRadius'],
  button: ['ctas'],
};

/**
 * The graphical editor of a hero section, as the button editor is one of a button: a toolbar (devices, undo, redo), the hero as readers
 * see it, and a panel. Title, subtitle and intro are typed in place in the white card (`okrPlainEditable`, as in an article). A click
 * on the background shows the cover settings, on the logo its settings, on a button that button (`okr-hero-panel`); «+ Logo» and
 * «+ Button» add them. A click on the text shows the section's own settings (`okr-section-config part="appearance"`, shared by every
 * section type), tags and notes.
 *
 * It edits `formData` of `SectionEditModal`, which saves (change confirmation) as for every other section. The undo history is its
 * own: every change is a step, typing into one field makes one step per pause. A change from outside (the modal's «Abbrechen») is a step too.
 */
@Component({
  selector: 'okr-hero-editor',
  standalone: true,
  imports: [
    ErrorNote, HeroPanel, Img, PlainEditable, SectionPanel, NgTemplateOutlet, SvgIconPipe,
    IonButton, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    .bar ion-segment { flex: none; width: 300px; min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; overflow: auto; padding: 16px; background: var(--ion-color-light); }
    .page { margin: 0 auto; transition: max-width 0.2s ease; }
    /* as okr-hero-section draws it */
    .hero { position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; padding: 24px 0; border-radius: 4px;
      cursor: pointer; outline: 1px dashed transparent; outline-offset: -1px; }
    .hero:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 50%, transparent); }
    .hero.selected { outline: 3px solid var(--ion-color-primary); outline-offset: -3px; }
    .hero-image { position: absolute; inset: 0; display: block; padding: 0; z-index: 1; }
    :host ::ng-deep .hero-image .image-container,
    :host ::ng-deep .hero-image img { width: 100% !important; height: 100% !important; object-fit: cover !important; object-position: var(--hero-focus, 50% 50%) !important; opacity: 0.85; }
    .band { position: absolute; inset: 0; z-index: 1; }
    .card { position: relative; z-index: 5; background: #fff; color: #222; padding: 20px; border-radius: 10px; width: 90%; max-width: 600px; text-align: center; cursor: default; }
    .logo-cell { display: block; width: 50%; max-width: 300px; margin: 0 auto 8px; border-radius: 6px; padding: 2px; cursor: pointer; outline: 1px dashed transparent; }
    .logo-cell:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 50%, transparent); }
    .logo-cell.selected { outline: 2px solid var(--ion-color-primary); }
    .add { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; font: inherit; font-size: 0.8rem; color: var(--ion-color-medium);
      background: transparent; border: 1px dashed var(--ion-color-medium); border-radius: 6px; cursor: pointer; }
    .add ion-icon { font-size: 14px; }
    .intro-above { margin: 0 0 4px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .title { font-size: 2rem; }
    .subtitle { font-size: 1.2rem; }
    .intro-below { margin: 6px 0 0; font-size: 1rem; opacity: 0.8; white-space: pre-line; }
    [okrPlainEditable] { display: block; min-height: 1.2em; border-radius: 4px; outline: none; cursor: text; }
    [okrPlainEditable]:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    [okrPlainEditable]:focus { box-shadow: 0 0 0 2px var(--ion-color-primary); }
    [okrPlainEditable].empty::before { content: attr(data-placeholder); opacity: 0.45; pointer-events: none; }
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; font-size: 0.85rem; opacity: 0.7; }
    .ctas { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; margin-top: 12px; }
    .cta { position: relative; border-radius: 6px; padding: 2px; outline: 1px dashed transparent; }
    .cta:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 50%, transparent); }
    .cta.selected { outline: 2px solid var(--ion-color-primary); }
    .cta ion-button { margin: 0; pointer-events: none; }
    .cta .empty { font-style: italic; opacity: 0.7; }
    .hint { display: block; margin: 12px 4px 0; font-size: 0.85rem; }
    .panel { flex: none; width: 360px; overflow: auto; overscroll-behavior: contain; padding-bottom: 24px; border-inline-start: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff); }
    .panel-head { display: flex; align-items: center; gap: 4px; padding: 12px 16px 0; }
    .panel-head h2 { flex: 1; margin: 0; font-size: 1.1rem; font-weight: 600; }
    .rest { padding: 0 16px; }
    @media (width < 1024px) {
      .work { flex-direction: column; }
      .canvas { flex: 1 1 0; }
      .panel { flex: 0 1 auto; width: auto; max-height: 45%; border-inline-start: 0; border-top: 1px solid var(--ion-color-light-shade); }
      .bar ion-segment { display: none; }
    }
  `],
  template: `
    @let t = i18n;
    <div class="bar">
      <ion-segment [value]="device()" [attr.aria-label]="t.article_editor_device_label()" (ionChange)="chooseDevice($event.detail.value)">
        @for (name of devices; track name) { <ion-segment-button [value]="name"><ion-label>{{ deviceLabels()[name] }}</ion-label></ion-segment-button> }
      </ion-segment>
      <ion-button fill="clear" size="small" [disabled]="history().past.length === 0" [title]="t.article_editor_undo()" [attr.aria-label]="t.article_editor_undo()" (click)="step('undo')">
        <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
      <ion-button fill="clear" size="small" [disabled]="history().future.length === 0" [title]="t.article_editor_redo()" [attr.aria-label]="t.article_editor_redo()" (click)="step('redo')">
        <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
    </div>
    <div class="work">
      <div class="canvas">
        <div class="page" [style.max-width]="deviceWidth()">
          <div class="hero" role="button" tabindex="0" [class.selected]="selected() === 'cover'" [style.min-height]="heightCss()" [style.--hero-focus]="objectPosition()"
            [attr.aria-label]="t.hero_editor_canvas_cover()" [attr.aria-pressed]="selected() === 'cover'" (click)="select('cover')" (keydown.enter)="onHeroEnter($event)">
            @if (hasCover()) {
              <okr-img class="hero-image" [image]="config().hero" [imageStyle]="coverStyle()" />
            } @else {
              <div class="band" [style.background]="band()"></div>
            }
            <div class="card" (click)="$event.stopPropagation()">
              @if (hasLogo()) {
                <div class="logo-cell" role="button" tabindex="0" [class.selected]="selected() === 'logo'" [attr.aria-label]="t.hero_editor_canvas_logo()"
                  [attr.aria-pressed]="selected() === 'logo'" (click)="select('logo')" (keydown.enter)="select('logo')">
                  <okr-img [image]="config().logo" [imageStyle]="logoStyle()" />
                </div>
              } @else {
                <button type="button" class="add" (click)="select('logo')"><ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" />{{ t.hero_editor_canvas_addLogo() }}</button>
              }
              @if (introPosition() === 'above') {
                <p class="intro-above" okrPlainEditable [value]="section().intro ?? ''" [placeholder]="t.article_editor_canvas_introPlaceholder()" (valueChange)="setText('intro', $event)" (focusin)="select('section')"></p>
              }
              <div class="title" okrPlainEditable [value]="section().title ?? ''" [placeholder]="t.article_editor_canvas_titlePlaceholder()" (valueChange)="setText('title', $event)" (focusin)="select('section')"></div>
              <div class="subtitle" okrPlainEditable [value]="section().subTitle ?? ''" [placeholder]="t.article_editor_canvas_subTitlePlaceholder()" (valueChange)="setText('subTitle', $event)" (focusin)="select('section')"></div>
              @if (introPosition() !== 'above') {
                <p class="intro-below" okrPlainEditable [multiline]="true" [value]="section().intro ?? ''" [placeholder]="t.article_editor_canvas_introPlaceholder()" (valueChange)="setText('intro', $event)" (focusin)="select('section')"></p>
              }
              <!-- facts of the travel journal: written there, shown here as readers see them -->
              @if (chips().length > 0) {
                <div class="chips">@for (chip of chips(); track $index) { <span>{{ chip }}</span> }</div>
              }
              <div class="ctas">
                @for (cta of ctas(); track $index; let i = $index) {
                  <div class="cta" role="button" tabindex="0" [class.selected]="isButton(i)" [attr.aria-label]="buttonName(i)" [attr.aria-pressed]="isButton(i)"
                    (click)="selectButton(i)" (keydown.enter)="selectButton(i)">
                    <ion-button [color]="cta.style === 'secondary' ? 'secondary' : 'primary'" [fill]="cta.style === 'secondary' ? 'outline' : 'solid'" tabindex="-1">
                      @if (cta.label.trim()) { {{ cta.label }} } @else { <span class="empty">{{ t.hero_editor_canvas_buttonPlaceholder() }}</span> }
                    </ion-button>
                  </div>
                }
                @if (ctas().length < maxCtas) {
                  <button type="button" class="add" (click)="addButton()"><ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" />{{ t.cta_add() }}</button>
                }
              </div>
            </div>
          </div>
          <ion-note class="hint">{{ t.hero_editor_canvas_hint() }}</ion-note>
        </div>
      </div>

      <div class="panel" role="region" [attr.aria-label]="t.hero_editor_panel_label()">
        @if (panelPart(); as part) {
          <div class="panel-head">
            <ion-button fill="clear" size="small" [title]="t.hero_editor_panel_back()" [attr.aria-label]="t.hero_editor_panel_back()" (click)="select('section')">
              <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
            </ion-button>
            <h2>{{ panelTitle() }}</h2>
            @if (selected() === 'button' && buttonIndex() > 0) {
              <ion-button fill="clear" size="small" (click)="moveButtonForward()">{{ t.hero_editor_button_forward() }}</ion-button>
            }
          </div>
          <ng-container [ngTemplateOutlet]="restErrors" />
          <okr-hero-panel [part]="part" [config]="config()" (configChange)="setConfig($event)" [buttonIndex]="buttonIndex()"
            [storagePath]="storagePath()" [currentUser]="currentUser()" [errors]="errors()" [readOnly]="false" [i18n]="t" />
        } @else {
          <okr-section-panel [title]="panelTitle()" [section]="section()" (sectionChange)="setSection($event)" [(showDetails)]="sectionDetails"
            [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [allTags]="allTags()" [i18n]="t" [errors]="errors()">
            <ng-container ngProjectAs="[okrPanelErrors]"><ng-container [ngTemplateOutlet]="restErrors" /></ng-container>
          </okr-section-panel>
        }
        <ng-template #restErrors>
          <!-- errors that no field of this panel shows, so that a missing save banner is never unexplained -->
          @if (rest().length > 0) {
            <div class="rest">
              <ion-note>{{ t.hero_editor_panel_errors() }}</ion-note>
              @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
            </div>
          }
        </ng-template>
      </div>
    </div>
  `,
})
export class HeroEditor {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<HeroSection>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');
  public readonly tenantId = input.required<string>();

  // outputs
  public readonly valid = output<boolean>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...HERO_EDITOR_I18N_KEYS }) as HeroEditorI18n;
  protected readonly devices = DEVICES;
  protected readonly maxCtas = HERO_MAX_CTAS;

  // the section
  protected readonly section = computed(() => this.formData());
  protected readonly config = computed<HeroConfig>(() => this.section().properties);
  protected readonly storagePath = computed(() => `tenant/${this.tenantId()}/section/${this.section().okey}`);
  protected readonly introPosition = computed(() => this.section().introPosition ?? 'below');
  protected readonly hasCover = computed(() => heroHasCover(this.config()));
  protected readonly hasLogo = computed(() => heroHasLogo(this.config()));
  protected readonly ctas = computed(() => heroCtasOf(this.config()));
  protected readonly chips = computed(() => this.config().chips ?? []);
  protected readonly imageStyle = computed(() => this.config().imageStyle ?? IMAGE_STYLE_SHAPE);
  protected readonly coverStyle = computed(() => heroBackgroundStyle(this.imageStyle(), heroImgixParams(this.config())));
  protected readonly logoStyle = computed(() => heroLogoStyle(this.imageStyle()));
  protected readonly heightCss = computed(() => heroHeightCss(this.config().height));
  protected readonly objectPosition = computed(() => this.config().focus ? heroObjectPosition(this.config().focus) : null);
  /** the band the website draws without a cover: primary / secondary until colours are stored */
  protected readonly band = computed(() => {
    const gradient = this.config().gradient;
    const from = gradient?.from ?? 'var(--ion-color-primary)';
    const to = gradient?.to ?? 'var(--ion-color-secondary)';
    return `linear-gradient(90deg, ${from}, ${to})`;
  });

  // selection, devices
  protected readonly selected = signal<Selection>('section');
  protected readonly selectedButton = signal(0);
  /** the button shown; a removed one falls back to the section (see constructor) */
  protected readonly buttonIndex = computed(() => Math.min(this.selectedButton(), Math.max(this.ctas().length - 1, 0)));
  protected readonly panelPart = computed<HeroPanelPart | undefined>(() => {
    const selected = this.selected();
    if (selected === 'section') return undefined;
    if (selected === 'button' && this.ctas().length === 0) return undefined;
    return selected;
  });
  protected readonly device = signal<Device>('desktop');
  protected readonly deviceWidth = computed(() => DEVICE_WIDTHS[this.device()]);
  protected readonly deviceLabels = computed<Record<Device, string>>(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));
  protected readonly panelTitle = computed(() => {
    switch (this.panelPart()) {
      case 'cover': return this.i18n.hero_editor_panel_cover();
      case 'logo': return this.i18n.hero_editor_panel_logo();
      case 'button': return this.buttonName(this.buttonIndex());
      default: return this.i18n.hero_editor_panel_section();
    }
  });

  // errors: one run of the suite for canvas and panels
  private readonly result = computed(() => heroSectionValidations(this.section()));
  protected readonly errors = computed(() => this.result().getErrors() as SectionErrors);
  protected readonly rest = computed(() => {
    const part = this.panelPart();
    return restErrors(this.errors(), part ? PART_FIELDS[part] : SECTION_PANEL_FIELDS);
  });

  /** the toggle in the head of «Abschnitt»: off when the editor opens */
  protected readonly sectionDetails = signal(false);

  // undo history
  /** starts with the first value of `formData` (a model has none while the component is created) */
  protected readonly history = signal<EditorHistory<HeroSection | undefined>>(createHistory<HeroSection | undefined>(undefined));

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
    // a change from outside (the modal's «Abbrechen») is a step that can be undone
    effect(() => {
      const current = this.formData();
      untracked(() => {
        const history = this.history();
        if (history.present === undefined) this.history.set(createHistory<HeroSection | undefined>(current));
        else if (current !== history.present) this.history.set(record(history, current));
      });
    });
  }

  /************************************** changes *********************************************** */
  /** `tag`: typing into the same field within a pause makes one step */
  private change(next: HeroSection, tag?: string): void {
    this.history.update((h) => record(h, next, { tag }));
    this.formData.set(next);
  }

  protected setSection(section: SectionModel): void {
    if (section !== this.section()) this.change(section as HeroSection, 'section');
  }

  protected setText(field: 'title' | 'subTitle' | 'intro', value: string): void {
    if (value !== (this.section()[field] ?? '')) this.change({ ...this.section(), [field]: value }, field);
  }

  protected setConfig(config: HeroConfig): void {
    this.change({ ...this.section(), properties: config }, 'hero');
  }

  protected addButton(): void {
    const next = addHeroCta(this.config());
    if (next === this.config()) return;
    this.setConfig(next);
    this.selectButton(heroCtasOf(next).length - 1);
  }

  protected moveButtonForward(): void {
    const index = this.buttonIndex();
    this.setConfig(moveHeroCtaForward(this.config(), index));
    this.selectedButton.set(index - 1);
  }

  protected step(direction: 'undo' | 'redo'): void {
    const next = direction === 'undo' ? undo(this.history()) : redo(this.history());
    if (next === this.history() || next.present === undefined) return;
    this.history.set(next);
    this.formData.set(next.present);
  }

  /** Cmd/Ctrl+Z and the like, except in a field (canvas text or panel), which keeps its own. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = historyKey(event);
    if (!key || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, ion-input, ion-textarea, ion-select, [contenteditable]')) return;
    event.preventDefault();
    this.step(key);
  }

  protected select(selection: Selection): void {
    this.selected.set(selection);
  }

  protected selectButton(index: number): void {
    this.selectedButton.set(index);
    this.selected.set('button');
  }

  /** Enter on the hero itself selects the cover; on the text or a button inside it, it is theirs */
  protected onHeroEnter(event: Event): void {
    if (event.target === event.currentTarget) this.select('cover');
  }

  protected isButton(index: number): boolean {
    return this.panelPart() === 'button' && this.buttonIndex() === index;
  }

  protected buttonName(index: number): string {
    return fill(this.i18n.cta_button(), { n: index + 1 });
  }

  protected chooseDevice(value: unknown): void {
    const device = DEVICES.find((d) => d === value);
    if (device) this.device.set(device);
  }

}
