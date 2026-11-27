import { Component, DestroyRef, computed, inject, input, linkedSignal, signal, untracked, viewChild, type Signal } from '@angular/core';
import { AlertController, IonButton, IonContent, IonIcon, IonLabel, IonModalToken, IonSegment, IonSegmentButton, IonSpinner, ToastController } from '@ionic/angular';

import { deviceFor, historyKey, isTypedInto, topOverlay, type ArticleHeaderChange } from '@okr/cms-article-feature';
import { PeopleEditorGate, SectionService } from '@okr/cms-section-data-access';
import { PeoplePanel, type PeoplePanelPerson, type PeoplePanelPick } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, ARTICLE_PROFILE, SECTION_I18N_KEYS, addPeoplePerson, addPeopleResponsibility, createHistory, isPeopleSectionChanged,
  openPeopleSection, peopleSectionValidations, peopleTypingTag, preparePeopleForSave, record, redo, replacePresent, setPeopleGroup,
  setPeopleResponsibilityParent, undo, type ArticleEditorI18n, type ArticlePreviewDevice, type EditorHistory, type PeopleEditorState,
} from '@okr/cms-section-util';
import { DEFAULT_LABEL } from '@okr/shared-constants';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PEOPLE_SECTION_SHAPE, peopleHiddenKeys, type CategoryListModel, type PeopleConfig, type PeopleSection, type UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { fill } from '@okr/shared-util-core';
import { showToast } from '@okr/shared-util-angular';

import { closeDecision } from './article-editor-modal.util';
import { PeopleEditorCanvas } from './people-editor-canvas';

type History = EditorHistory<PeopleEditorState>;

/** a second press on the close icon waits in Ionic until the question of the first one was answered */
const CLOSE_AGAIN_MS = 300;

/**
 * The people block editor (spec 1.181 §7): header, change-confirmation, a toolbar row (devices, undo, redo), the canvas and the panel.
 * It holds the section being edited, its undo history and its saving; it stays open until a save succeeded, and `onSaved` tells the key
 * of each one. Nothing is written in trial mode, or while the gate does not allow it.
 *
 * Open it with `openPeopleEditor` only: it is in no chunk that readers load and not exported from the lib.
 */
@Component({
  selector: 'okr-people-editor-modal',
  standalone: true,
  imports: [
    ChangeConfirmation, Header, PeopleEditorCanvas, PeoplePanel, SvgIconPipe,
    IonButton, IonContent, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonSpinner,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    .editor { display: flex; flex-direction: column; height: 100%; }
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    .bar ion-segment { flex: none; width: 300px; min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .status { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-size: 0.85rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .status ion-spinner { width: 20px; height: 20px; flex: none; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; min-height: 0; }
    .panel { flex: none; width: 360px; overflow: auto; overscroll-behavior: contain; padding-bottom: 24px; border-inline-start: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff); color: var(--ion-text-color, #000); }
    @media (width < 1024px) {
      .work { flex-direction: column; }
      .canvas { flex: 1 1 0; }
      .panel { flex: 0 1 auto; width: auto; max-height: 50%; border-inline-start: 0; border-top: 1px solid var(--ion-color-light-shade); }
    }
  `],
  template: `
    @let t = i18n;
    <okr-header [i18n]="{ title: isNew() ? t.people_editor_title_new() : t.people_editor_title_edit() }" [isModal]="true" />
    @if (valid() && changed()) {
      <okr-change-confirmation [i18n]="{ cancel: t.cancel(), save: t.save() }" (cancelClicked)="reset()" (saveClicked)="save()" />
    }
    <ion-content [scrollY]="false" class="ion-no-padding">
      <div class="editor">
        <div class="bar">
          @if (!phone()) {
            <ion-segment [value]="device()" [attr.aria-label]="t.article_editor_device_label()" (ionChange)="chooseDevice($event.detail.value)">
              @for (name of devices; track name) {
                <ion-segment-button [value]="name"><ion-label>{{ deviceLabels()[name] }}</ion-label></ion-segment-button>
              }
            </ion-segment>
          }
          <ion-button fill="clear" size="small" [disabled]="history().past.length === 0" [title]="t.article_editor_undo()" [attr.aria-label]="t.article_editor_undo()" (click)="stepBack()">
            <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" aria-hidden="true" />
          </ion-button>
          <ion-button fill="clear" size="small" [disabled]="history().future.length === 0" [title]="t.article_editor_redo()" [attr.aria-label]="t.article_editor_redo()" (click)="stepForward()">
            <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" aria-hidden="true" />
          </ion-button>
          <div class="status" role="status">
            @if (saving()) {
              <ion-spinner name="crescent" aria-hidden="true" /><span>{{ t.people_editor_save_running() }}</span>
            } @else if (loading()) {
              <ion-spinner name="crescent" aria-hidden="true" /><span>{{ t.people_editor_loading() }}</span>
            } @else if (trial) {
              <span>{{ t.article_editor_notice_trial() }}</span>
            }
          </div>
        </div>
        <div class="work">
          <okr-people-editor-canvas class="canvas" [section]="current()" [selectedKey]="selectedKey()" [device]="device()" [i18n]="t"
            (selectPerson)="select($event)" (configChange)="onCanvasChange($event)" (headerChange)="onHeaderChange($event)" (add)="pickInto('person')" />
          <div class="panel">
            <okr-people-panel [section]="current()" (sectionChange)="onSectionChange($event)" [selected]="selectedPerson()" [hiddenCount]="hiddenCount()"
              [groupName]="groupName()" [roles]="roles()" [states]="states()" [currentUser]="currentUser()" [allTags]="allTags()" [i18n]="t" [errors]="errors()"
              (pick)="pickInto($event)" (deselect)="select(undefined)" />
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class PeopleEditorModal {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);
  private readonly gate = inject(PeopleEditorGate);
  private readonly sectionService = inject(SectionService);
  private readonly modelSelectService = inject(ModelSelectService);
  /** not named `modal`: Ionic sets a property of that name */
  private readonly overlay = inject(IonModalToken);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18nService = inject(I18nService);

  // inputs
  /** as it was read; a new one with the key it will get */
  public readonly section = input.required<PeopleSection>();
  public readonly isNew = input.required<boolean>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly tagModel = input.required<string>();
  /** called after each save with the key of the document; never in trial mode */
  public readonly onSaved = input.required<(key: string) => void>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS }) as ArticleEditorI18n;
  /** optional: read in computeds that run before the view is created */
  protected readonly canvas = viewChild(PeopleEditorCanvas);
  protected readonly trial = this.gate.trial;

  // the section
  /** once: the inputs of the modal do not change */
  protected readonly opened = computed(() => untracked(() => {
    const section = this.section();
    return openPeopleSection(this.isNew() && !section.roleNeeded ? { ...section, roleNeeded: PEOPLE_SECTION_SHAPE.roleNeeded } : section);
  }));
  protected readonly history = linkedSignal<History>(() => createHistory<PeopleEditorState>({ section: this.opened() }));
  /** what is stored: as opened, later as saved */
  private readonly baseline = linkedSignal<PeopleSection>(() => this.opened());
  protected readonly current = computed(() => this.history().present.section);
  protected readonly selectedKey = computed(() => this.history().present.selectedKey);
  protected readonly changed = computed(() => isPeopleSectionChanged(this.baseline(), this.current()));
  private readonly config = computed<PeopleConfig>(() => this.current().properties);

  // errors: one run of the suite for the panel and the banner
  private readonly result = computed(() => peopleSectionValidations(this.current()));
  protected readonly errors = computed(() => this.result().getErrors());
  protected readonly valid = computed(() => this.result().isValid());

  // what the canvas read
  protected readonly loading = computed(() => this.canvas()?.loading() ?? true);
  protected readonly selectedPerson = computed<PeoplePanelPerson | undefined>(() => {
    const key = this.selectedKey();
    const person = key === undefined ? undefined : this.canvas()?.persons().find((p) => p.key === key);
    if (!person) return undefined;
    const func = this.canvas()?.functions()[person.key] ?? person.label ?? '';
    return { person, func, source: this.sourceText(func), hidden: peopleHiddenKeys(this.config()).includes(person.key) };
  });
  protected readonly hiddenCount = computed(() => {
    const hidden = new Set(peopleHiddenKeys(this.config()));
    return (this.canvas()?.personKeys() ?? []).filter((key) => hidden.has(key)).length;
  });
  protected readonly groupName = computed(() => {
    const groupId = this.config().groupId;
    return groupId ? this.appStore.getGroup(groupId)?.name ?? '' : '';
  });
  /** «Werte bearbeiten» of the tags saves at once: in trial mode it is not offered */
  protected readonly allTags = computed(() => this.trial ? '' : this.appStore.getTags(this.tagModel()));

  // window
  protected readonly devices = ARTICLE_PROFILE.devices;
  protected readonly deviceLabels = computed<Record<ArticlePreviewDevice, string>>(() => ({
    auto: '', mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));
  private readonly chosenDevice = signal<ArticlePreviewDevice>('desktop');
  protected readonly phone = mediaSignal('(width < 768px)');
  protected readonly device = computed(() => deviceFor(this.chosenDevice(), this.phone(), ARTICLE_PROFILE));

  // saving
  protected readonly saving = signal(false);
  /** after the first save of a new section it is an update */
  private isCreate = true;
  /** saved, closes by itself */
  private done = false;
  private leaving = false;
  /** a question stands above the editor, or was answered just now: it does not close */
  private asking = false;
  private askingOver: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.overlay.canDismiss = () => this.mayClose();
    this.destroyRef.onDestroy(() => clearTimeout(this.askingOver));
  }

  /** Ionic: closed by now, only its animation goes on. */
  public ionViewWillLeave(): void { this.leaving = true; }

  // ------------------------------------------------------- changes -------------------------------------------------------

  private apply(section: PeopleSection, tag?: string): void {
    this.history.update((history) => section === history.present.section ? history : record(history, { ...history.present, section }, { tag }));
  }

  /** From the panel; a run of typing in one field is one step. */
  protected onSectionChange(section: PeopleSection): void {
    this.apply(section, peopleTypingTag(this.current(), section));
  }

  /** From the canvas: title, subtitle or intro typed in place; a run of typing in one of them is one step. */
  protected onHeaderChange(change: ArticleHeaderChange): void {
    this.onSectionChange({ ...this.current(), [change.field]: change.value });
  }

  /** From the canvas: move, hide, show, remove. */
  protected onCanvasChange(properties: PeopleConfig): void {
    this.apply({ ...this.current(), properties });
  }

  /** Selecting is no step. */
  protected select(key: string | undefined): void {
    this.history.update((history) => history.present.selectedKey === key ? history : replacePresent(history, { ...history.present, selectedKey: key }));
  }

  /** «Abbrechen»: the section as it is stored, as a step that can be undone. */
  protected reset(): void {
    this.history.update((history) => record(history, { section: this.baseline(), selectedKey: history.present.selectedKey }));
  }

  protected stepBack(): void { this.history.update(undo); }
  protected stepForward(): void { this.history.update(redo); }

  /** The pickers of today's section form; what is picked is one step. */
  protected async pickInto(what: PeoplePanelPick): Promise<void> {
    if (this.done || this.leaving) return;
    switch (what) {
      case 'person': {
        const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
        if (!avatar || this.gone()) return;
        this.apply({ ...this.current(), properties: addPeoplePerson(this.config(), avatar) });
        this.select(avatar.key);
        return;
      }
      case 'group': {
        const group = await this.modelSelectService.selectGroup();
        if (group && !this.gone()) this.apply({ ...this.current(), properties: setPeopleGroup(this.config(), group.okey) });
        return;
      }
      case 'responsibility': {
        const responsibility = await this.modelSelectService.selectResponsibility();
        if (responsibility && !this.gone()) this.apply({ ...this.current(), properties: addPeopleResponsibility(this.config(), responsibility.okey) });
        return;
      }
      case 'parent': {
        const group = await this.modelSelectService.selectGroup();
        if (group && !this.gone()) this.apply({ ...this.current(), properties: setPeopleResponsibilityParent(this.config(), `group.${group.okey}`, group.name) });
        return;
      }
    }
  }

  private gone(): boolean {
    return this.done || this.leaving || this.destroyRef.destroyed;
  }

  // ----------------------------------------------------- undo and redo ---------------------------------------------------

  /** Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z; in a text field of the panel the browser's own undo works. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = historyKey(event);
    if (!key || this.done || this.leaving || !this.isOnTop()) return;
    const from = event.composedPath()[0];
    if (from instanceof Element && isTypedInto(from)) return;
    event.preventDefault();
    if (key === 'undo') this.stepBack();
    else this.stepForward();
  }

  /** Whether no picker, sheet or question is open above this modal. */
  private isOnTop(): boolean {
    return topOverlay() === this.overlay;
  }

  protected chooseDevice(value: unknown): void {
    const device = this.devices.find((name) => name === value);
    if (device) this.chosenDevice.set(device);
  }

  // ------------------------------------------------------- saving -------------------------------------------------------

  /** A second press while a save runs is ignored; what is changed meanwhile stays and can be saved next. */
  protected async save(): Promise<void> {
    if (this.saving() || this.asking || this.done || this.leaving || !this.valid() || !this.changed()) return;
    // before the source is read the shown keys are not complete, and every override would be dropped
    if (this.loading()) {
      void showToast(this.toastController, this.i18n.people_editor_loading());
      return;
    }
    if (this.trial) {
      void showToast(this.toastController, this.i18n.people_editor_save_trial());
      return;
    }
    const canvas = this.canvas();
    if (!canvas) return;
    const state = this.history().present;
    // a source read as empty (a failed or empty read) would drop every override: refused, the editor stays open
    const props = state.section.properties;
    const hasOverrides = peopleHiddenKeys(props).length > 0 || (Array.isArray(props.orderKeys) && props.orderKeys.length > 0);
    if (props.type !== 'persons' && canvas.personKeys().length === 0 && hasOverrides) {
      console.warn('PeopleEditorModal: the source has no persons, the overrides are kept and nothing is written');
      void showToast(this.toastController, this.i18n.people_editor_save_empty());
      return;
    }
    this.saving.set(true);
    let key: string | undefined;
    try {
      if (!(await this.gate.loadMayWrite())) {
        console.warn('PeopleEditorModal: the gate is closed, nothing is written');
        void showToast(this.toastController, this.i18n.people_editor_save_failed());
        return;
      }
      const prepared = preparePeopleForSave(state.section, canvas.personKeys(), canvas.naturalKeys());
      if (!prepared.tenants?.length) prepared.tenants = [this.appStore.tenantId()];
      // the service shows its own message, also when it fails (then undefined)
      key = this.isCreate && this.isNew()
        ? await this.sectionService.create(prepared, this.currentUser())
        : await this.sectionService.update(prepared, this.currentUser());
    } catch (error) {
      console.error('PeopleEditorModal: the section could not be saved', error);
      void showToast(this.toastController, this.i18n.people_editor_save_failed());
      return;
    } finally {
      this.saving.set(false);
    }
    if (!key) return;
    this.isCreate = false;
    this.onSaved()(key);
    this.baseline.set(this.adoptKey(key, state.section));
    // changed meanwhile, or at work in a picker: stays open, with the banner if there is something to save
    if (!this.changed() && this.isOnTop()) await this.close(key);
  }

  /**
   * A section of another tenant is saved as this tenant's copy `<key>_<tenantId>` (`SectionService.update` forks it): from then on the
   * editor works on the copy, in every step of its history, so that a later save updates it instead of forking again.
   * @returns `saved` with that key
   */
  private adoptKey(key: string, saved: PeopleSection): PeopleSection {
    if (saved.okey === key) return saved;
    const tenants = [this.appStore.tenantId()];
    const adopted = new Map<PeopleSection, PeopleSection>();
    const adopt = (section: PeopleSection): PeopleSection => {
      let copy = adopted.get(section);
      if (!copy) adopted.set(section, copy = { ...section, okey: key, tenants });
      return copy;
    };
    const step = (state: PeopleEditorState): PeopleEditorState => ({ ...state, section: adopt(state.section) });
    this.history.update((history) => ({ ...history, past: history.past.map(step), present: step(history.present), future: history.future.map(step) }));
    return adopt(saved);
  }

  // ------------------------------------------------------- closing -------------------------------------------------------

  private async close(key?: string): Promise<void> {
    this.done = true;
    await this.overlay.dismiss(key, 'confirm');
  }

  /** Close icon, Escape, hardware back and everything else that closes a modal. */
  private async mayClose(): Promise<boolean> {
    if (this.asking && !this.done) return false;
    switch (closeDecision({ done: this.done, saving: this.saving(), changed: this.changed() })) {
      case 'allow': return true;
      case 'refuse':
        void showToast(this.toastController, this.i18n.people_editor_save_running());
        return false;
      case 'ask': return this.ask(this.i18n.article_editor_discard_message(), this.i18n.article_editor_discard_confirm(), this.i18n.article_editor_discard_keep());
    }
  }

  /** Answered when the question is gone. */
  private async ask(message: string, yes: string, no: string): Promise<boolean> {
    clearTimeout(this.askingOver);
    this.asking = true;
    try {
      const alert = await this.alertController.create({ message, buttons: [{ text: no, role: 'cancel' }, { text: yes, role: 'confirm' }] });
      await alert.present();
      return (await alert.onDidDismiss()).role === 'confirm';
    } finally {
      this.askingOver = setTimeout(() => { this.asking = false; }, CLOSE_AGAIN_MS);
    }
  }

  // ------------------------------------------------------- texts --------------------------------------------------------

  private sourceText(func: string): string {
    switch (this.config().type ?? 'persons') {
      case 'group': return fill(this.i18n.people_editor_from_group(), { name: this.groupName() || this.config().groupId || '' });
      case 'responsibility': return fill(this.i18n.people_editor_from_responsibility(), { name: func });
      default: return this.i18n.people_editor_from_persons();
    }
  }
}

/** Whether the window matches `query`; in an injection context. */
function mediaSignal(query: string): Signal<boolean> {
  const media = window.matchMedia(query);
  const matches = signal(media.matches);
  const onChange = (event: MediaQueryListEvent): void => matches.set(event.matches);
  media.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
  return matches.asReadonly();
}
