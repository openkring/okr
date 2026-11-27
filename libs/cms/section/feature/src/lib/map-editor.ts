import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton } from '@ionic/angular';

import { historyKey, PlainEditable } from '@okr/cms-article-feature';
import { MapPanel, SectionConfiguration } from '@okr/cms-section-ui';
import {
  applyMapCanvasView, ARTICLE_EDITOR_I18N_KEYS, mapEditableConfig, createHistory, getFieldErrors, MAP_EDITOR_I18N_KEYS, MAP_READER_I18N_KEYS, mapPinsOf,
  mapSectionValidations, mapShowsLocateButton, mapStartOf, pickErrors, record, redo, restErrors, SECTION_I18N_KEYS, undo,
  type ArticlePreviewDevice, type EditorHistory, type MapEditorI18n, type MapReaderI18n, type MapView, type SectionErrors,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel, LocationModel, MAP_CONFIG_SHAPE, MapConfig, MapSection, RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Chips, ErrorNote, LeafletMap, MapMarker, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { hasRole } from '@okr/shared-util-core';

type Selection = 'section' | 'map';
type Device = Exclude<ArticlePreviewDevice, 'auto'>;
const DEVICES: readonly Device[] = ['mobile', 'tablet', 'desktop'];
const DEVICE_WIDTHS: Record<Device, string> = { mobile: '390px', tablet: '768px', desktop: '100%' };
/** the error names the section panel shows at a field */
const SECTION_FIELDS = ['title', 'subTitle', 'intro', 'introPosition', 'roleNeeded', 'state', 'colSize', 'name', 'tags', 'notes'];
/** the error names the map panel shows at a field */
const MAP_FIELDS = ['centerLatitude', 'centerLongitude', 'zoom', 'useCurrentLocationAsCenter', 'showLocateButton', 'locationKeys', 'pinFields', 'layer'];

/**
 * The graphical editor of a map section, as the hero editor is one of a hero: a toolbar (devices, undo, redo), the map as readers see
 * it, and a panel. Title, subtitle and intro are typed in place above the map (`okrPlainEditable`). A click on the map shows its
 * settings (`okr-map-panel`): where it starts, how close, «Mein Standort», and the locations shown as pins. Moving or zooming the map
 * on the canvas is a setting too: with «Dieser Ausschnitt» it frames the start; otherwise the centre is fixed and only the zoom is
 * taken. The toggle in the panel's title shows the stored coordinates field by field. A click on the text shows the section's own
 * settings (`okr-section-config part="appearance"`, shared by every section type), tags and notes.
 *
 * The canvas draws the map with Leaflet (swisstopo); readers get the Google map of `okr-map-section` at the same centre and zoom.
 * It edits `formData` of `SectionEditModal`, which saves (change confirmation) as for every other section. The undo history is its
 * own: every change is a step, moving the map or typing into one field makes one step per pause. A change from outside (the modal's
 * «Abbrechen») is a step too.
 */
@Component({
  selector: 'okr-map-editor',
  standalone: true,
  imports: [
    Chips, ErrorNote, LeafletMap, MapPanel, PlainEditable, SectionConfiguration, SvgIconPipe, TextareaInput,
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
    .page { margin: 0 auto; transition: max-width 0.2s ease; background: var(--ion-background-color, #fff); border-radius: 4px; overflow: hidden; }
    .head { padding: 12px 16px 8px; }
    .intro-above { margin: 0 0 4px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .title { font-size: 1.4rem; font-weight: 600; }
    .subtitle { font-size: 0.95rem; color: var(--ion-color-medium); }
    .intro-below { margin: 6px 0 0; font-size: 0.95rem; white-space: pre-line; }
    [okrPlainEditable] { display: block; min-height: 1.2em; border-radius: 4px; outline: none; cursor: text; }
    [okrPlainEditable]:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    [okrPlainEditable]:focus { box-shadow: 0 0 0 2px var(--ion-color-primary); }
    [okrPlainEditable].empty::before { content: attr(data-placeholder); opacity: 0.45; pointer-events: none; }
    /* as okr-map-section draws it: 400 px high, full width */
    .map { position: relative; height: 400px; outline: 1px dashed transparent; outline-offset: -1px; }
    .map:hover { outline-color: color-mix(in srgb, var(--ion-color-primary) 50%, transparent); }
    .map.selected { outline: 3px solid var(--ion-color-primary); outline-offset: -3px; }
    .map okr-leaflet-map { position: absolute; inset: 0; z-index: 0; }
    .locate { position: absolute; left: 12px; bottom: 12px; z-index: 500; pointer-events: none; }
    .locate ion-button { margin: 0; }
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
          <div class="head">
            @if (introPosition() === 'above') {
              <p class="intro-above" okrPlainEditable [value]="section().intro ?? ''" [placeholder]="t.article_editor_canvas_introPlaceholder()" (valueChange)="setText('intro', $event)" (focusin)="select('section')"></p>
            }
            <div class="title" okrPlainEditable [value]="section().title ?? ''" [placeholder]="t.article_editor_canvas_titlePlaceholder()" (valueChange)="setText('title', $event)" (focusin)="select('section')"></div>
            <div class="subtitle" okrPlainEditable [value]="section().subTitle ?? ''" [placeholder]="t.article_editor_canvas_subTitlePlaceholder()" (valueChange)="setText('subTitle', $event)" (focusin)="select('section')"></div>
            @if (introPosition() !== 'above') {
              <p class="intro-below" okrPlainEditable [multiline]="true" [value]="section().intro ?? ''" [placeholder]="t.article_editor_canvas_introPlaceholder()" (valueChange)="setText('intro', $event)" (focusin)="select('section')"></p>
            }
          </div>
          <!-- a press anywhere on the map (also to move it) shows its settings -->
          <div class="map" role="region" tabindex="0" [class.selected]="selected() === 'map'" [attr.aria-label]="t.map_editor_canvas_map()"
            (pointerdown)="select('map')" (focusin)="select('map')">
            <okr-leaflet-map [view]="canvasView()" [fixedCenter]="fixedCenter()" [markers]="markers()" (viewChange)="onViewChange($event)" />
            @if (showsLocate()) {
              <div class="locate">
                <ion-button size="small" color="light" tabindex="-1"><ion-icon slot="start" src="{{ 'location' | svgIcon }}" aria-hidden="true" />{{ readerI18n.map_locate() }}</ion-button>
              </div>
            }
          </div>
        </div>
        <ion-note class="hint">{{ t.map_editor_canvas_hint() }}</ion-note>
      </div>

      <div class="panel" role="region" [attr.aria-label]="t.map_editor_panel_label()">
        <div class="panel-head">
          @if (selected() !== 'section') {
            <ion-button fill="clear" size="small" [title]="t.map_editor_panel_back()" [attr.aria-label]="t.map_editor_panel_back()" (click)="select('section')">
              <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
            </ion-button>
          }
          <h2>{{ selected() === 'map' ? t.map_editor_panel_map() : t.map_editor_panel_section() }}</h2>
          @if (selected() === 'map') {
            <!-- the stored coordinates field by field -->
            <ion-button fill="clear" size="small" [title]="advancedLabel()" [attr.aria-label]="advancedLabel()" [attr.aria-pressed]="advanced()" (click)="advanced.set(!advanced())">
              <ion-icon slot="icon-only" src="{{ (advanced() ? 'toggle' : 'toggle-off') | svgIcon }}" aria-hidden="true" />
            </ion-button>
          }
        </div>
        <!-- errors that no field of this panel shows, so that a missing save banner is never unexplained -->
        @if (rest().length > 0) {
          <div class="rest">
            <ion-note>{{ t.map_editor_panel_errors() }}</ion-note>
            @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
          </div>
        }

        @if (selected() === 'map') {
          <okr-map-panel [config]="config()" (configChange)="setConfig($event)" [locations]="locations()" [canvasView]="canvasView()"
            [advanced]="advanced()" [errors]="errors()" [readOnly]="false" [i18n]="t" />
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
export class MapEditor {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly formData = model.required<MapSection>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');
  /** every location of the tenant: the club's own (key = tenant id), the places to start at, the pins */
  public readonly locations = input<LocationModel[]>([]);
  public readonly tenantId = input.required<string>();

  // outputs
  public readonly valid = output<boolean>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS, ...MAP_EDITOR_I18N_KEYS }) as MapEditorI18n;
  protected readonly readerI18n = this.i18nService.translateAll(MAP_READER_I18N_KEYS) as MapReaderI18n;
  protected readonly devices = DEVICES;

  // the section
  protected readonly section = computed(() => this.formData());
  /** «Mein Standort» and the zoom as readers see them (`mapEditableConfig`): the first change writes them */
  protected readonly config = computed<MapConfig>(() => mapEditableConfig({ ...MAP_CONFIG_SHAPE, ...(this.section().properties ?? {}) }));
  protected readonly introPosition = computed(() => this.section().introPosition ?? 'below');
  protected readonly start = computed(() => mapStartOf(this.config(), this.locations()));
  /** the club's location, as `okr-map-section` reads it (the location keyed by the tenant id) */
  private readonly tenantLocation = computed(() => this.locations().find((l) => l.okey === this.tenantId()));
  /** what the canvas shows: the club's location or the stored centre, at the stored zoom */
  protected readonly canvasView = computed<MapView>(() => {
    const config = this.config();
    const club = this.tenantLocation();
    if (this.start() === 'tenant' && club) return { lat: club.latitude, lng: club.longitude, zoom: config.zoom };
    return { lat: config.centerLatitude, lng: config.centerLongitude, zoom: config.zoom };
  });
  /** only «Dieser Ausschnitt» is framed by moving the map; otherwise the centre is the club's or the location's */
  protected readonly fixedCenter = computed(() => this.start() !== 'view');
  protected readonly markers = computed<MapMarker[]>(() => mapPinsOf(this.config(), this.locations())
    .map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng, title: pin.snippet ? `${pin.title} · ${pin.snippet}` : pin.title })));
  protected readonly showsLocate = computed(() => mapShowsLocateButton(this.config()));

  // selection, devices
  protected readonly selected = signal<Selection>('section');
  protected readonly advanced = signal(false);
  protected readonly advancedLabel = computed(() => (this.advanced() ? this.i18n.map_editor_advanced_hide() : this.i18n.map_editor_advanced_show()));
  protected readonly device = signal<Device>('desktop');
  protected readonly deviceWidth = computed(() => DEVICE_WIDTHS[this.device()]);
  protected readonly deviceLabels = computed<Record<Device, string>>(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));

  // errors: one run of the suite for canvas and panels
  private readonly result = computed(() => mapSectionValidations(this.section()));
  protected readonly errors = computed(() => this.result().getErrors() as SectionErrors);
  protected readonly sectionErrors = computed(() => pickErrors(this.errors(), SECTION_FIELDS));
  protected readonly rest = computed(() => restErrors(this.errors(), this.selected() === 'map' ? MAP_FIELDS : SECTION_FIELDS));

  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n.notes_label(), placeholder: this.i18n.notes_placeholder() } as TextareaInputI18n));

  // undo history
  /** starts with the first value of `formData` (a model has none while the component is created) */
  protected readonly history = signal<EditorHistory<MapSection | undefined>>(createHistory<MapSection | undefined>(undefined));

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
    // a change from outside (the modal's «Abbrechen») is a step that can be undone
    effect(() => {
      const current = this.formData();
      untracked(() => {
        const history = this.history();
        if (history.present === undefined) this.history.set(createHistory<MapSection | undefined>(current));
        else if (current !== history.present) this.history.set(record(history, current));
      });
    });
  }

  /************************************** changes *********************************************** */
  /** `tag`: typing into the same field, or moving the map, within a pause makes one step */
  private change(next: MapSection, tag?: string): void {
    this.history.update((h) => record(h, next, { tag }));
    this.formData.set(next);
  }

  protected setSection(section: SectionModel): void {
    if (section !== this.section()) this.change(section as MapSection, 'section');
  }

  protected setField(field: 'tags' | 'notes', value: string): void {
    this.change({ ...this.section(), [field]: value }, field);
  }

  protected setText(field: 'title' | 'subTitle' | 'intro', value: string): void {
    if (value !== (this.section()[field] ?? '')) this.change({ ...this.section(), [field]: value }, field);
  }

  protected setConfig(config: MapConfig): void {
    this.change({ ...this.section(), properties: config }, 'map');
  }

  /** the map was moved or zoomed on the canvas (also when it shows a view it was given: then nothing changes) */
  protected onViewChange(view: MapView): void {
    const next = applyMapCanvasView(this.config(), view, this.start());
    if (next !== this.config()) this.change({ ...this.section(), properties: next }, 'view');
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
    if (target?.closest('input, textarea, ion-input, ion-textarea, ion-select, ion-searchbar, [contenteditable]')) return;
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
