import { Component, computed, effect, inject, input, model, output, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { ArticleHeaderEdit, historyKey, type ArticleHeaderChange } from '@okr/cms-article-feature';
import { ButtonFormOption, ButtonPanel, ButtonWidget, SectionConfiguration } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, BUTTON_EDITOR_I18N_KEYS, buttonConfigOf, buttonSectionValidations, withUploadedFile, createHistory, getFieldErrors, pickErrors, record, redo,
  restErrors, SECTION_I18N_KEYS, undo, type ArticlePreviewDevice, type ButtonEditorI18n, type EditorHistory, type SectionErrors,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { ButtonConfig, ButtonSection, CategoryListModel, EDITOR_CONFIG_SHAPE, EditorConfig, RoleName, SectionModel, UserModel, ViewPosition } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Chips, ErrorNote, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { RichTextInline, type RichTextFeature } from '@okr/shared-ui-editor';
import { hasRole } from '@okr/shared-util-core';

type Selection = 'section' | 'button';
type Device = Exclude<ArticlePreviewDevice, 'auto'>;
const DEVICES: readonly Device[] = ['mobile', 'tablet', 'desktop'];
const DEVICE_WIDTHS: Record<Device, string> = { mobile: '390px', tablet: '768px', desktop: '100%' };
/** as in a text block of an article: what readers never see is not offered */
const HIDDEN_FEATURES: readonly RichTextFeature[] = ['history', 'colors', 'align', 'indent', 'image'];
/** the error names the section panel shows at a field */
const SECTION_FIELDS = ['title', 'subTitle', 'intro', 'introPosition', 'roleNeeded', 'state', 'colSize', 'name', 'tags', 'notes'];
/** the error names the button panel shows at a field; with «Anpassen» open every one of the button */
const BUTTON_FIELDS = ['style.', 'icon.', 'action.'];

/**
 * The graphical editor of a button section, as the article editor is one of an article: a toolbar (devices, undo, redo and the text
 * tools), the section as readers see it, and a panel. Title, subtitle and intro are typed in place (`okr-article-header-edit`, the
 * same as in an article), the text too (`okr-rich-text-inline`). A click on the button shows its settings (`okr-button-panel`);
 * otherwise the panel shows the section's own settings (`okr-section-config part="appearance"`, shared by every section type),
 * tags and notes.
 *
 * It edits `formData` of `SectionEditModal`, which saves (change confirmation) as for every other section. The undo history is its
 * own: every change is a step, typing into one field makes one step per pause. A change from outside (the modal's «Abbrechen») is a step too.
 */
@Component({
  selector: 'okr-button-editor',
  standalone: true,
  imports: [
    ArticleHeaderEdit, ButtonPanel, ButtonWidget, Chips, ErrorNote, RichTextInline, SectionConfiguration, SvgIconPipe, TextareaInput,
    IonButton, IonCard, IonCardContent, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    .bar ion-segment { flex: none; width: 300px; min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .text-tools { flex: 1; min-width: 0; overflow-x: auto; }
    .text-tools ::ng-deep .rte-toolbar { border-bottom: 0; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; overflow: auto; padding: 16px; background: var(--ion-color-light); }
    .page { margin: 0 auto; transition: max-width 0.2s ease; }
    .page ion-card { margin: 0; }
    .layout { display: flex; gap: 16px; align-items: center; }
    .layout.top { flex-direction: column; align-items: stretch; }
    .layout.bottom { flex-direction: column-reverse; align-items: stretch; }
    .layout.right { flex-direction: row-reverse; }
    .button-cell { flex: none; border-radius: 8px; padding: 4px; cursor: pointer; outline: 1px dashed transparent; }
    .button-cell:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    .button-cell.selected { outline: 2px solid var(--ion-color-primary); }
    .text-cell { flex: 1; min-width: 0; min-height: 2em; border-radius: 4px; cursor: text; }
    .text-cell:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    .text-cell:focus-within { box-shadow: 0 0 0 2px var(--ion-color-primary); }
    .text-cell .placeholder { opacity: 0.45; }
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
      <div class="text-tools" role="group" [attr.aria-label]="t.article_editor_textTools()"><ng-container #textTools /></div>
    </div>
    <div class="work">
      <div class="canvas">
        <div class="page" [style.max-width]="deviceWidth()">
          <ion-card>
            <okr-article-header-edit [title]="section().title ?? ''" [subTitle]="section().subTitle ?? ''" [intro]="section().intro ?? ''" [introPosition]="section().introPosition ?? 'below'"
              [titlePlaceholder]="t.article_editor_canvas_titlePlaceholder()" [subTitlePlaceholder]="t.article_editor_canvas_subTitlePlaceholder()"
              [introPlaceholder]="t.article_editor_canvas_introPlaceholder()" (headerChange)="onHeaderChange($event)" />
            <ion-card-content>
              <div [class]="'layout ' + layoutName()">
                <div class="button-cell" role="button" tabindex="0" [class.selected]="selected() === 'button'" [style.width]="buttonWidth()"
                  [attr.aria-label]="t.button_editor_canvas_select()" [attr.aria-pressed]="selected() === 'button'" (click)="select('button')" (keydown.enter)="select('button')">
                  <okr-button-widget [section]="section()" [editMode]="true" [i18n]="t" />
                </div>
                @if (position() !== VP.None) {
                  <div class="text-cell" (click)="editText()" (focusin)="editText()">
                    @if (textEditing()) {
                      @if (!textReady()) { <div [innerHTML]="html()"></div> }
                      <okr-rich-text-inline [value]="html()" [placeholder]="t.article_editor_canvas_textPlaceholder()" [hiddenFeatures]="hiddenFeatures"
                        [toolbarHost]="toolbarHost()" (valueChange)="setText($event)" (ready)="textReady.set(true)" (failed)="textEditing.set(false)" />
                    } @else if (hasText()) {
                      <div tabindex="0" [innerHTML]="html()"></div>
                    } @else {
                      <p class="placeholder" tabindex="0">{{ t.article_editor_canvas_textPlaceholder() }}</p>
                    }
                  </div>
                }
              </div>
            </ion-card-content>
          </ion-card>
          <ion-note class="hint">{{ position() === VP.None ? t.button_editor_canvas_noText() : t.button_editor_canvas_hint() }}</ion-note>
        </div>
      </div>

      <div class="panel" role="region" [attr.aria-label]="t.button_editor_panel_label()">
        <div class="panel-head">
          @if (selected() === 'button') {
            <ion-button fill="clear" size="small" [title]="t.button_editor_panel_back()" [attr.aria-label]="t.button_editor_panel_back()" (click)="select('section')">
              <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
            </ion-button>
            <h2>{{ t.button_editor_panel_button() }}</h2>
          } @else {
            <h2>{{ t.button_editor_panel_section() }}</h2>
          }
        </div>
        <!-- errors that no field of this panel shows, so that a missing save banner is never unexplained -->
        @if (rest().length > 0) {
          <div class="rest">
            <ion-note>{{ t.button_editor_panel_errors() }}</ion-note>
            @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
          </div>
        }

        @if (selected() === 'button') {
          <okr-button-panel [config]="config()" (configChange)="setConfig($event)" [content]="content()" (contentChange)="setContent($event)"
            [contracts]="contracts()" [forms]="forms()" [errors]="errors()" [readOnly]="false" [i18n]="t"
            [uploads]="!!onUpload()" [uploading]="uploading()" (upload)="uploadFile()" />
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
export class ButtonEditor {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<ButtonSection>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');
  public readonly contracts = input<{ okey: string; name: string }[]>([]);
  public readonly forms = input<ButtonFormOption[]>([]);
  /** uploads a file for a download button (not saved here); none: the panel offers no upload */
  public readonly onUpload = input<(sectionKey: string | undefined) => Promise<{ url: string; name: string } | undefined>>();

  // outputs
  public readonly valid = output<boolean>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...BUTTON_EDITOR_I18N_KEYS }) as ButtonEditorI18n;
  protected readonly VP = ViewPosition;
  protected readonly devices = DEVICES;
  protected readonly hiddenFeatures = HIDDEN_FEATURES;
  protected readonly toolbarHost = viewChild('textTools', { read: ViewContainerRef });

  // the section
  protected readonly section = computed(() => this.formData());
  protected readonly config = computed(() => buttonConfigOf(this.section().properties));
  protected readonly content = computed<EditorConfig>(() => ({ ...EDITOR_CONFIG_SHAPE, ...(this.section().content ?? {}) }));
  protected readonly position = computed(() => this.content().position ?? ViewPosition.None);
  protected readonly html = computed(() => this.content().htmlContent ?? '');
  protected readonly hasText = computed(() => this.html().replace(/<[^>]*>/g, '').trim().length > 0);
  protected readonly layoutName = computed(() => {
    switch (this.position()) {
      case ViewPosition.Top: return 'top';
      case ViewPosition.Bottom: return 'bottom';
      case ViewPosition.Right: return 'right';
      case ViewPosition.Left: return 'left';
      default: return 'alone';
    }
  });
  /** as `okr-button-section` draws it: the button takes colSize of 12 next to the text, all of it above or below */
  protected readonly buttonWidth = computed(() => {
    const position = this.position();
    if (position !== ViewPosition.Left && position !== ViewPosition.Right) return '100%';
    return `calc(${(this.content().colSize ?? 6) / 12 * 100}% - 8px)`;
  });

  // selection, text, devices
  protected readonly selected = signal<Selection>('section');
  protected readonly textEditing = signal(false);
  protected readonly textReady = signal(false);
  protected readonly device = signal<Device>('desktop');
  protected readonly deviceWidth = computed(() => DEVICE_WIDTHS[this.device()]);
  protected readonly deviceLabels = computed<Record<Device, string>>(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));

  // errors: one run of the suite for canvas and panels
  private readonly result = computed(() => buttonSectionValidations(this.section()));
  protected readonly errors = computed(() => this.result().getErrors() as SectionErrors);
  protected readonly sectionErrors = computed(() => pickErrors(this.errors(), SECTION_FIELDS));
  protected readonly rest = computed(() => restErrors(this.errors(), this.selected() === 'button' ? BUTTON_FIELDS : SECTION_FIELDS));

  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n.notes_label(), placeholder: this.i18n.notes_placeholder() } as TextareaInputI18n));

  // undo history
  /** starts with the first value of `formData` (a model has none while the component is created) */
  protected readonly history = signal<EditorHistory<ButtonSection | undefined>>(createHistory<ButtonSection | undefined>(undefined));

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
    // a change from outside (the modal's «Abbrechen») is a step that can be undone
    effect(() => {
      const current = this.formData();
      untracked(() => {
        const history = this.history();
        if (history.present === undefined) this.history.set(createHistory<ButtonSection | undefined>(current));
        else if (current !== history.present) this.history.set(record(history, current));
      });
    });
  }

  /************************************** changes *********************************************** */
  /** `tag`: typing into the same field within a pause makes one step */
  private change(next: ButtonSection, tag?: string): void {
    this.history.update((h) => record(h, next, { tag }));
    this.formData.set(next);
  }

  protected setSection(section: SectionModel): void {
    if (section !== this.section()) this.change(section as ButtonSection, 'section');
  }

  protected setField(field: 'tags' | 'notes', value: string): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected onHeaderChange({ field, value }: ArticleHeaderChange): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected setConfig(config: ButtonConfig): void {
    this.change({ ...this.section(), properties: config }, 'button');
  }

  protected readonly uploading = signal(false);

  /** uploads a file and makes it the button's download; the section is saved with the change confirmation, as any change */
  protected async uploadFile(): Promise<void> {
    const upload = this.onUpload();
    if (!upload || this.uploading()) return;
    this.uploading.set(true);
    try {
      const file = await upload(this.section().okey || undefined);
      if (file) this.setConfig(withUploadedFile(this.section().properties, file));
    } finally {
      this.uploading.set(false);
    }
  }

  protected setContent(content: EditorConfig): void {
    this.change({ ...this.section(), content });
  }

  protected setText(html: string): void {
    if (html !== this.html()) this.change({ ...this.section(), content: { ...this.content(), htmlContent: html } }, 'text');
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

  protected editText(): void {
    this.selected.set('section');
    this.textEditing.set(true);
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
