import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { ArticleHeaderEdit, historyKey, type ArticleHeaderChange } from '@okr/cms-article-feature';
import { IframePanel, SectionConfiguration } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, createHistory, getFieldErrors, IFRAME_EDITOR_I18N_KEYS, iframeHeightCss, iframeSectionValidations, pickErrors, record, redo,
  restErrors, SECTION_I18N_KEYS, undo, type ArticlePreviewDevice, type EditorHistory, type IframeEditorI18n, type SectionErrors,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, IframeConfig, IframeSection, RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Chips, ErrorNote, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { getSafeEmbedUrl, hasRole } from '@okr/shared-util-core';

import { IframeSectionComponent } from './iframe-section';

type Selection = 'section' | 'iframe';
type Device = Exclude<ArticlePreviewDevice, 'auto'>;
const DEVICES: readonly Device[] = ['mobile', 'tablet', 'desktop'];
const DEVICE_WIDTHS: Record<Device, string> = { mobile: '390px', tablet: '768px', desktop: '100%' };
/** the error names the section panel shows at a field */
const SECTION_FIELDS = ['title', 'subTitle', 'intro', 'introPosition', 'roleNeeded', 'state', 'colSize', 'name', 'tags', 'notes'];
/** the error names the iframe panel shows at a field */
const IFRAME_FIELDS = ['url', 'height'];

/**
 * The graphical editor of an iframe section, built as the video editor: a toolbar (devices, undo, redo), the section as readers see it,
 * and a panel. Title, subtitle and intro are typed in place (`okr-article-header-edit`, the same as in an article). A click on the
 * embedded page shows its settings (`okr-iframe-panel`: the link or embed code as copied, and the height); otherwise the panel shows
 * the section's own settings (`okr-section-config part="appearance"`, shared by every section type), tags and notes.
 *
 * The page is drawn by `okr-iframe-section` itself, under a cover that takes the click: while the page is selected the cover is gone,
 * so it can be tried. A page the app may not show (not on the embed allowlist) is a placeholder that says so. It edits `formData` of
 * `SectionEditModal`, which saves (change confirmation) as for every other section. The undo history is its own; a change from outside
 * (the modal's «Abbrechen») is a step too.
 */
@Component({
  selector: 'okr-iframe-editor',
  standalone: true,
  imports: [
    ArticleHeaderEdit, Chips, ErrorNote, IframePanel, IframeSectionComponent, SectionConfiguration, SvgIconPipe, TextareaInput,
    IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
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
    .page ion-card { margin: 0; }
    .frame-cell { position: relative; border-radius: 8px; padding: 4px; outline: 1px dashed transparent; }
    .frame-cell:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    .frame-cell.selected { outline: 2px solid var(--ion-color-primary); }
    .cover { position: absolute; inset: 0; z-index: 1; cursor: pointer; border-radius: 8px; }
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; margin: 0 auto;
      color: var(--ion-color-medium); background: var(--ion-color-light-tint); border: 1px dashed var(--ion-color-medium-tint); border-radius: 6px; text-align: center; padding: 8px; }
    .empty ion-icon { font-size: 40px; }
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
          <ion-card>
            <okr-article-header-edit [title]="section().title ?? ''" [subTitle]="section().subTitle ?? ''" [intro]="section().intro ?? ''" [introPosition]="section().introPosition ?? 'below'"
              [titlePlaceholder]="t.article_editor_canvas_titlePlaceholder()" [subTitlePlaceholder]="t.article_editor_canvas_subTitlePlaceholder()"
              [introPlaceholder]="t.article_editor_canvas_introPlaceholder()" (headerChange)="onHeaderChange($event)" />
            <ion-card-content>
              <div class="frame-cell" [class.selected]="selected() === 'iframe'">
                @if (selected() !== 'iframe') {
                  <div class="cover" role="button" tabindex="0" [attr.aria-label]="t.iframe_editor_canvas_select()" (click)="select('iframe')" (keydown.enter)="select('iframe')"></div>
                }
                @if (isShown()) {
                  <okr-iframe-section [section]="preview()" />
                } @else {
                  <div class="empty" [style.height]="height()">
                    <ion-icon src="{{ (hasPage() ? 'warning' : 'globe') | svgIcon }}" aria-hidden="true" />
                    <span>{{ hasPage() ? t.iframe_editor_canvas_blocked() : t.iframe_editor_canvas_empty() }}</span>
                  </div>
                }
              </div>
            </ion-card-content>
          </ion-card>
          <ion-note class="hint">{{ t.iframe_editor_canvas_hint() }}</ion-note>
        </div>
      </div>

      <div class="panel" role="region" [attr.aria-label]="t.iframe_editor_panel_label()">
        <div class="panel-head">
          @if (selected() === 'iframe') {
            <ion-button fill="clear" size="small" [title]="t.iframe_editor_panel_back()" [attr.aria-label]="t.iframe_editor_panel_back()" (click)="select('section')">
              <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
            </ion-button>
            <h2>{{ t.iframe_editor_panel_iframe() }}</h2>
          } @else {
            <h2>{{ t.iframe_editor_panel_section() }}</h2>
          }
        </div>
        <!-- errors that no field of this panel shows, so that a missing save banner is never unexplained -->
        @if (rest().length > 0) {
          <div class="rest">
            <ion-note>{{ t.iframe_editor_panel_errors() }}</ion-note>
            @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
          </div>
        }

        @if (selected() === 'iframe') {
          <okr-iframe-panel [config]="config()" (configChange)="setConfig($event)" [errors]="errors()" [readOnly]="false" [i18n]="t" />
        } @else {
          <!-- title, subtitle and intro are typed on the canvas: their errors stand here -->
          <div class="rest">
            <okr-error-note [errors]="errorsFor('title')" />
            <okr-error-note [errors]="errorsFor('subTitle')" />
            <okr-error-note [errors]="errorsFor('intro')" />
          </div>
          <okr-section-config part="appearance" [headerTitle]="t.article_editor_article_settings()" [formData]="section()" (formDataChange)="setSection($event)"
            [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [showAdvanced]="true" [readOnly]="false" [i18n]="t" [errors]="sectionErrors()" />
          @if (hasRole('privileged')) {
            <okr-chips chipName="tag" [storedChips]="section().tags ?? ''" (storedChipsChange)="setField('tags', $event)" [allChips]="allTags()" [readOnly]="false" />
            <okr-error-note [errors]="errorsFor('tags')" />
          }
          @if (hasRole('admin')) {
            <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="section().notes ?? ''" (valueChange)="setField('notes', $event)" [errors]="errorsFor('notes')" [readOnly]="false" />
          }
        }
      </div>
    </div>
  `,
})
export class IframeEditor {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<IframeSection>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');

  // outputs
  public readonly valid = output<boolean>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...IFRAME_EDITOR_I18N_KEYS }) as IframeEditorI18n;
  protected readonly devices = DEVICES;

  // the section
  protected readonly section = computed(() => this.formData());
  /** without the shape's default height: a section stored before 2026-11-27 derives it from its style */
  protected readonly config = computed<IframeConfig>(() => {
    const properties: Partial<IframeConfig> = this.section().properties ?? {};
    return { ...properties, url: properties.url ?? '' };
  });
  protected readonly hasPage = computed(() => (this.config().url ?? '').trim() !== '');
  /** a page on the embed allowlist: only such a one is drawn, in the app as here */
  protected readonly isShown = computed(() => getSafeEmbedUrl(this.config().url) !== null);
  protected readonly height = computed(() => iframeHeightCss(this.config()));
  /** the page as readers see it, without the header: that one is typed above */
  protected readonly preview = computed<IframeSection>(() => ({ ...this.section(), title: '', subTitle: '', intro: '', properties: this.config() }));

  // selection, devices
  protected readonly selected = signal<Selection>('section');
  protected readonly device = signal<Device>('desktop');
  protected readonly deviceWidth = computed(() => DEVICE_WIDTHS[this.device()]);
  protected readonly deviceLabels = computed<Record<Device, string>>(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));

  // errors: one run of the suite for canvas and panels
  private readonly result = computed(() => iframeSectionValidations(this.section()));
  protected readonly errors = computed(() => this.result().getErrors() as SectionErrors);
  protected readonly sectionErrors = computed(() => pickErrors(this.errors(), SECTION_FIELDS));
  protected readonly rest = computed(() => restErrors(this.errors(), this.selected() === 'iframe' ? IFRAME_FIELDS : SECTION_FIELDS));

  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n.notes_label(), placeholder: this.i18n.notes_placeholder() } as TextareaInputI18n));

  // undo history
  /** starts with the first value of `formData` (a model has none while the component is created) */
  protected readonly history = signal<EditorHistory<IframeSection | undefined>>(createHistory<IframeSection | undefined>(undefined));

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
    // a change from outside (the modal's «Abbrechen») is a step that can be undone
    effect(() => {
      const current = this.formData();
      untracked(() => {
        const history = this.history();
        if (history.present === undefined) {
          this.history.set(createHistory<IframeSection | undefined>(current));
          if (!this.hasPage()) this.selected.set('iframe');   // a new section has no page yet: its link comes first
        } else if (current !== history.present) this.history.set(record(history, current));
      });
    });
  }

  /************************************** changes *********************************************** */
  /** `tag`: typing into the same field within a pause makes one step */
  private change(next: IframeSection, tag?: string): void {
    this.history.update((h) => record(h, next, { tag }));
    this.formData.set(next);
  }

  protected setSection(section: SectionModel): void {
    if (section !== this.section()) this.change(section as IframeSection, 'section');
  }

  protected setField(field: 'tags' | 'notes', value: string): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected onHeaderChange({ field, value }: ArticleHeaderChange): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected setConfig(config: IframeConfig): void {
    this.change({ ...this.section(), properties: config }, 'iframe');
  }

  protected step(direction: 'undo' | 'redo'): void {
    const next = direction === 'undo' ? undo(this.history()) : redo(this.history());
    if (next === this.history() || next.present === undefined) return;
    this.history.set(next);
    this.formData.set(next.present);
  }

  /** Cmd/Ctrl+Z and the like, except in a field of the panel, which keeps its own. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = historyKey(event);
    if (!key || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, ion-input, ion-textarea, ion-select')) return;
    event.preventDefault();
    this.step(key);
  }

  protected select(selection: Selection): void {
    this.selected.set(selection);
  }

  protected chooseDevice(value: unknown): void {
    const device = DEVICES.find((d) => d === value);
    if (device) this.device.set(device);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
