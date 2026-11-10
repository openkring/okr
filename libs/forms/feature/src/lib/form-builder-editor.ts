import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CdkDragDrop, CdkDropList, CdkDropListGroup, CdkDrag, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  AlertController, IonButton, IonButtons, IonChip, IonContent, IonIcon, IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton, IonToolbar, ModalController,
  ToastController,
} from '@ionic/angular';
import { combineLatest, map } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill, getTodayStr, replaceSubstring, safeStructuredClone, SSN_FIELD_KEY } from '@okr/shared-util-core';
import { Field, FormDefinitionModel, FormMapping, FormSectionConfig, PageModel, SectionModel } from '@okr/shared-models';
import { PageService } from '@okr/cms-page-data-access';
import { SectionService } from '@okr/cms-section-data-access';

import { FormDefinitionService } from '@okr/forms-data-access';
import {
  buildPrefillQuery, COURSE_FIELD_MAPPINGS, courseFieldIssues, conditionalBlockMembers, conditionOpLabels, DerivedRuleIssue, derivedValuesReferencing, describeRule, fieldsReferencing,
  fieldsBlockingOther, findDerivedRuleIssues, findDuplicateKeys, findRuleIssues, FORM_I18N_KEYS, FormI18n, getFormMapping, implicitSsnFields,
  misplacedSsnFields, otherKeyClashes, previewDerivedValues, removeDerivedReferencesTo,
  removeReferencesTo, ruleConnectors, RuleIssue,
} from '@okr/forms-util';
import { I18nService } from '@okr/shared-i18n';
import { FieldConfigModal, FieldTypeDef, FieldTypeLibrary, FormBuilderHelpModal, FormRenderer } from '@okr/forms-ui';
import { confirm, copyToClipboardDeferred, dismissOverlay, showToast } from '@okr/shared-util-angular';

/** The rejection reason of a cancelled page pick: nothing to copy, no error toast. */
const LINK_CANCELLED = 'link-cancelled';

/**
 * The pages that show this form (spec §8, plan decision 2): pages whose section list holds a form section with
 * this `formKey`. A page stores section keys with the `@TID@` placeholder resolved per tenant.
 */
function pagesShowingForm(pages: PageModel[], sections: SectionModel[], formKey: string, tenantId: string): PageModel[] {
  if (!formKey) return [];
  const formSectionKeys = new Set(sections
    .filter(s => s.type === 'form' && (s.properties as Partial<FormSectionConfig> | undefined)?.formKey === formKey)
    .map(s => s.okey));
  if (formSectionKeys.size === 0) return [];
  return pages.filter(p => (p.sections ?? []).some(key => formSectionKeys.has(replaceSubstring(key, '@TID@', tenantId))));
}

/** A new field from a library card; an «Eigene Angaben» card starts it with `asProperty` on. */
function newField(def: FieldTypeDef, order: number): Field {
  const type = def.type;
  const base = {
    id: crypto.randomUUID(),
    // an AHV number may only be stored as an application's `ssnId` (privacy 1.19)
    key: type === 'ssn' ? SSN_FIELD_KEY : `field${order}`,
    label: def.label ?? type,
    required: false,
    width: 'full' as const,
    order,
    ...(def.asProperty ? { asProperty: true } : {}),
  };
  switch (type) {
    case 'dropdown': case 'radio': return { ...base, type, options: [] };
    case 'checkbox': return { ...base, type };
    case 'avatar': return { ...base, type, avatarType: 'person' };
    case 'category': return { ...base, type, categoryName: '' };
    case 'paragraph': return { ...base, type, isIndented: true, isSmall: true };
    // an unsichtbares Feld starts as text: a course id
    case 'implicit': return { ...base, type, valueType: 'text' };
    // the course choice is stored as `courseKey` (1.152); its audience is the applicant type, usually `applicationAs`
    case 'course': return { ...base, key: 'courseKey', type, audienceFrom: 'applicationAs' };
    default: return { ...base, type } as Field;
  }
}

@Component({
  selector: 'okr-form-builder-editor',
  standalone: true,
  imports: [
    SvgIconPipe, Header, ChangeConfirmation,
    CdkDropList, CdkDropListGroup, CdkDrag, FieldTypeLibrary, FormRenderer,
    IonToolbar, IonButton, IonButtons, IonContent, IonItem, IonLabel, IonIcon, IonNote, IonChip,
    IonSegment, IonSegmentButton,
  ],
  styles: [`
    .editor-layout { display: flex; min-height: 100%; }
    .library-panel { width: 260px; border-right: 1px solid var(--ion-border-color); display: flex; flex-direction: column; }
    .canvas-panel  { flex: 1; padding: 8px; }
    .canvas-drop   { min-height: 200px; border: 2px dashed var(--ion-color-light-shade); border-radius: 8px; padding: 8px; }
    .canvas-empty  { display: flex; align-items: center; justify-content: center; height: 120px; color: var(--ion-color-medium); }
    .field-row     { display: flex; align-items: center; background: var(--ion-item-background); border-radius: 6px; margin: 4px 0; cursor: grab; }
    .field-row.in-block { margin-left: 24px; border-left: 3px solid var(--ion-color-light-shade); }
    .rule-line     { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .rule-line ion-chip { margin: 2px 0; height: 22px; font-size: 11px; }
    .rule-text     { white-space: normal; }
    .derived-issues { padding: 4px 0; }
    .duplicate-keys { display: block; padding: 8px 4px; }
    .cdk-drag-preview    { opacity: 0.8; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drop-list-dragging .field-row:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
    .source-actions { display: flex; gap: 8px; padding: 8px 16px 0; }
    .derived-preview { display: block; padding: 8px 0 0; }
    .link-actions  { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px 0 0; }
    .link-note     { display: block; padding: 4px 0 0; }
    .link-text     { display: block; padding: 4px 0 0; word-break: break-all; }
    .source-view   { margin: 8px 16px; padding: 12px; background: var(--ion-color-light); border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre; overflow: auto; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.title() + ': ' + formData().name }" [isModal]="true" />
    @if (isDirty()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" [saveDisabled]="hasKeyIssues()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content>
      <div class="editor-layout" cdkDropListGroup>

        <!-- left: field-type library -->
        <div class="library-panel">
          <okr-field-type-library [i18n]="i18n" [showProperties]="hasProperties()" [showCourse]="offersCourse()" (fieldAdded)="addField($event)" />
        </div>

        <!-- right: canvas -->
        <div class="canvas-panel">
          <ion-toolbar>
            <ion-segment [value]="viewMode()" (ionChange)="viewMode.set($any($event).detail.value)">
              <ion-segment-button value="editor"><ion-label>Editor</ion-label></ion-segment-button>
              <ion-segment-button value="preview"><ion-label>Vorschau</ion-label></ion-segment-button>
              <ion-segment-button value="source"><ion-label>Quellcode</ion-label></ion-segment-button>
            </ion-segment>
            <ion-buttons slot="end">
              <ion-button fill="clear" (click)="onHelp()" [attr.aria-label]="i18n.help_open()" [title]="i18n.help_open()">
                <ion-icon src="{{ 'information-circle' | svgIcon }}" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>

          @if (duplicateKeys().length > 0) {
            <!-- same check as the settings suite: a repeated input key blocks saving in both places -->
            <ion-note color="danger" class="duplicate-keys">{{ duplicateKeysText() }}</ion-note>
          }
          @if (misplacedSsn().length > 0) {
            <!-- same check as the settings suite: an AHV field outside an application's ssnId blocks saving -->
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_ssn_placement() }}</ion-note>
          }
          @if (implicitSsn().length > 0) {
            <!-- same check as the settings suite (R1): an AHV number never sits in clear text in the definition -->
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_implicit_ssn() }}</ion-note>
          }
          @if (otherBlocked().length > 0) {
            <!-- same check as the settings suite: «Andere …» on a typed choice key, an AHV field or a field without options -->
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_other_not_allowed() }}</ion-note>
          }
          @if (otherClash().length > 0) {
            <!-- same check as the settings suite: the «Andere …» text key is taken by another question or a derived value -->
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_other_key_clash() }}</ion-note>
          }
          @if (courseIssues().includes('once')) {
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_course_field_once() }}</ion-note>
          }
          @if (courseIssues().includes('mapping')) {
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_course_field_mapping() }}</ion-note>
          }
          @if (courseIssues().includes('audience')) {
            <ion-note color="danger" class="duplicate-keys">{{ i18n.fields_course_audience_from_missing() }}</ion-note>
          }
          @if (viewMode() === 'editor') {
            <!-- derived values live in the form settings; their broken conditions are flagged here, where fields change -->
            @if (derivedIssues().length > 0) {
              <div class="rule-line derived-issues">
                @for (issue of derivedIssues(); track issue.index + issue.reason) {
                  <ion-chip color="warning">
                    <ion-icon src="{{ 'warning' | svgIcon }}" />
                    <ion-label>{{ i18n.derived_title() }} «{{ issue.key }}»: {{ issueLabel(issue.reason) }}</ion-label>
                  </ion-chip>
                }
              </div>
            }
            <div
              class="canvas-drop"
              cdkDropList
              [cdkDropListData]="fields()"
              (cdkDropListDropped)="onDrop($event)"
            >
              @if (fields().length === 0) {
                <div class="canvas-empty">{{ i18n.canvas_empty() }}</div>
              }
              @for (field of fields(); track field.id) {
                <div class="field-row" [class.in-block]="blockMembers().has(field.id)" cdkDrag [cdkDragData]="field">
                  <ion-item lines="none" style="flex:1">
                    <ion-icon src="{{ 'reorder-four' | svgIcon }}" slot="start" cdkDragHandle />
                    <ion-label>
                      <strong>{{ field.label }}</strong>
                      <p>{{ field.key }} · {{ field.type }} · {{ field.width }}</p>
                      @if (field.type === 'implicit') {
                        <div class="rule-line">
                          <ion-chip color="medium" [outline]="true">{{ i18n.field_invisible() }}</ion-chip>
                        </div>
                      }
                      @if (ruleTexts().get(field.id); as ruleText) {
                        <div class="rule-line">
                          <ion-chip color="tertiary" [outline]="true">{{ i18n.rule_conditional() }}</ion-chip>
                          <span class="rule-text">{{ ruleText }}</span>
                        </div>
                      }
                      @if (issuesByField().get(field.id); as issues) {
                        <div class="rule-line">
                          @for (issue of issues; track issue) {
                            <ion-chip color="warning">
                              <ion-icon src="{{ 'warning' | svgIcon }}" />
                              <ion-label>{{ issueLabel(issue) }}</ion-label>
                            </ion-chip>
                          }
                        </div>
                      }
                    </ion-label>
                    @if (field.required) {
                      <ion-icon src="{{ 'alert-circle' | svgIcon }}" slot="end" color="danger" />
                    }
                  </ion-item>
                  <ion-button fill="clear" (click)="editField(field)">
                    <ion-icon src="{{ 'settings' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                  <ion-button fill="clear" color="danger" (click)="removeField(field.id)">
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </div>
              }
            </div>
          } @else if (viewMode() === 'preview') {
            @if (fields().length === 0) {
              <div class="canvas-empty">{{ i18n.preview_empty() }}</div>
            } @else {
              <div style="padding: 8px 16px 24px;">
                <!-- re-mounted per definition: the renderer builds its controls once, on init -->
                @for (definition of previewDefinitions(); track definition) {
                  <okr-form-renderer [definition]="definition" [categories]="appStore.allCategories()" [showSubmit]="false"
                    [otherI18n]="{ option: i18n.field_other_option(), placeholder: i18n.field_other_placeholder() }"
                    (valueChange)="previewValues.set($event)" />
                }
                @if (hasDerivedValues()) {
                  <ion-note class="derived-preview">{{ i18n.preview_derived() }} {{ derivedPreview() }}</ion-note>
                }
                <!-- «Link mit diesen Antworten erstellen» (spec §8): the page that shows the form, with the answers above -->
                <div class="link-actions">
                  <ion-button size="small" fill="outline" [disabled]="formPages().length === 0" (click)="createLink()">
                    <ion-icon src="{{ 'copy' | svgIcon }}" slot="start" />
                    {{ i18n.preview_link() }}
                  </ion-button>
                </div>
                @if (formPagesLoaded() && formPages().length === 0) {
                  <ion-note class="link-note">{{ i18n.preview_no_page() }}</ion-note>
                }
                @if (prefillLink().hasPersonalData) {
                  <ion-note color="warning" class="link-note">{{ i18n.preview_link_personal() }}</ion-note>
                }
                @if (copiedLink()) {
                  <ion-note class="link-text">{{ copiedLink() }}</ion-note>
                }
              </div>
            }
          } @else {
            <div class="source-actions">
              <ion-button size="small" fill="outline" (click)="copySource()">
                <ion-icon src="{{ 'copy' | svgIcon }}" slot="start" />
                {{ i18n.source_copy() }}
              </ion-button>
              <ion-button size="small" fill="outline" (click)="pasteSource()">
                {{ i18n.source_paste() }}
              </ion-button>
            </div>
            @if (sourceMessage()) {
              <ion-note [color]="sourceError() ? 'danger' : 'success'" style="display:block; padding: 0 16px 4px;">{{ sourceMessage() }}</ion-note>
            }
            <pre class="source-view">{{ sourceCode() }}</pre>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class FormBuilderEditor {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly formDefinitionService = inject(FormDefinitionService);
  private readonly pageService = inject(PageService);
  private readonly sectionService = inject(SectionService);
  protected readonly appStore = inject(AppStore);

  public readonly form = input.required<FormDefinitionModel>();

  protected formData = signal<FormDefinitionModel>({} as FormDefinitionModel);
  protected fields = signal<Field[]>([]);
  protected viewMode = signal<'editor' | 'preview' | 'source'>('editor');
  private readonly originalFieldsJson = signal('');

  // Direct inject (no store): the store opens this editor, importing it back would be circular.
  protected readonly i18n = inject(I18nService).translateAll(FORM_I18N_KEYS) as FormI18n;

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n.discard(), save: this.i18n.save(),
  }));

  /** Live form definition for the preview, reflecting the current (unsaved) fields. */
  protected previewDefinition = computed<FormDefinitionModel>(() => ({
    ...this.formData(),
    fields: [...this.fields()].sort((a, b) => a.order - b.order),
  }));

  /**
   * The preview definition as a one-element list, so `@for … track` re-mounts the renderer whenever it changes:
   * the renderer builds its controls (and their visibility) once, on init — a field added while the preview is
   * open would otherwise have no control and stay hidden until the next answer.
   */
  protected readonly previewDefinitions = computed(() => [this.previewDefinition()]);

  /**
   * The preview's answers (hidden ones included), as the renderer reports them. Back to «nothing answered»
   * whenever the definition changes or the preview is opened again, because the renderer then starts empty too.
   */
  protected readonly previewValues = linkedSignal<unknown, Record<string, unknown>>({
    source: () => [this.previewDefinition(), this.viewMode()], computation: () => ({}),
  });
  protected readonly hasDerivedValues = computed(() => (this.formData().derivedValues ?? []).length > 0);
  /** «applicationAs = youth, …» — what a submission with the preview's answers would store as derived values. */
  protected readonly derivedPreview = computed(() =>
    previewDerivedValues(this.previewDefinition(), this.previewValues(), getTodayStr()).join(', ') || '–');

  /** The query of a pre-filled link with the preview's answers (never an AHV field, R1), and whether it carries personal data. */
  protected readonly prefillLink = computed(() => buildPrefillQuery(this.previewDefinition().fields, this.previewValues()));
  /** The last link copied — shown under the button; gone as soon as an answer changes. */
  protected readonly copiedLink = linkedSignal<unknown, string>({ source: () => this.previewValues(), computation: () => '' });

  /** The tenant's pages that show this form — loaded when the preview opens (plan decision 2). */
  private readonly formPagesResource = rxResource({
    params: () => (this.viewMode() === 'preview' ? this.formData().formKey ?? '' : undefined),
    stream: ({ params: formKey }) => combineLatest([this.pageService.list(), this.sectionService.list()]).pipe(
      map(([pages, sections]) => pagesShowingForm(pages, sections, formKey, this.appStore.tenantId()))),
  });
  protected readonly formPages = computed(() => (this.formPagesResource.hasValue() ? this.formPagesResource.value() : []));
  protected readonly formPagesLoaded = computed(() => this.formPagesResource.hasValue());

  /** JSON source of the current form definition — editable externally via copy/paste. */
  protected sourceCode = computed(() => JSON.stringify(this.previewDefinition(), null, 2));

  /** Feedback for the source copy/paste actions ('' = none). */
  protected readonly sourceMessage = signal('');
  protected readonly sourceError = signal(false);

  /** The form's collection mapping (undefined for a URL target); one with a `propertiesField` offers «Eigene Angaben». */
  protected readonly mapping = computed<FormMapping | undefined>(() => {
    const target = this.formData().target;
    return target?.kind === 'collection' ? getFormMapping(target.mappingKey) : undefined;
  });
  protected readonly hasProperties = computed(() => !!this.mapping()?.propertiesField);
  /** the «Kurswahl» card: only on the membership mappings (1.152, A8) */
  protected readonly offersCourse = computed(() => COURSE_FIELD_MAPPINGS.includes(this.mapping()?.mappingKey ?? ''));

  /** The «wenn … » line under every field with a rule. */
  protected readonly ruleTexts = computed(() => {
    const fields = this.fields();
    const opLabels = conditionOpLabels(this.i18n);
    const connectors = ruleConnectors(this.i18n);
    const texts = new Map<string, string>();
    for (const field of fields) {
      if (!field.visibleIf) continue;
      const text = describeRule(field.visibleIf, fields, opLabels, connectors, this.i18n.field_other_option());
      if (text) texts.set(field.id, text);
    }
    return texts;
  });

  /** The rule problems per owning field (a controller deleted, moved below, or an answer that no longer exists). */
  protected readonly issuesByField = computed(() => {
    const byField = new Map<string, RuleIssue['reason'][]>();
    for (const issue of findRuleIssues(this.fields())) {
      byField.set(issue.fieldId, [...(byField.get(issue.fieldId) ?? []), issue.reason]);
    }
    return byField;
  });

  /** Derived-value cases whose controller was deleted or retyped, or whose compared answer no longer exists. */
  protected readonly derivedIssues = computed(() => findDerivedRuleIssues(this.formData().derivedValues ?? [], this.fields()));

  /** Keys used by more than one input field — shown above the canvas and block saving, as in the settings (spec 7.3). */
  protected readonly duplicateKeys = computed(() => findDuplicateKeys(this.fields()));
  protected readonly duplicateKeysText = computed(() =>
    fill(this.i18n.fields_duplicate_keys(), { keys: this.duplicateKeys().map(k => `«${k}»`).join(', ') }));
  /** AHV fields under another key than ssnId or on a non-application target — block saving, as in the settings. */
  protected readonly misplacedSsn = computed(() => misplacedSsnFields(this.fields(), this.mapping()));
  /** Implicit AHV fields (R1), «Andere …» where it is not allowed, and `<key>Other` clashes — pasted JSON can carry all three. */
  protected readonly implicitSsn = computed(() => implicitSsnFields(this.fields()));
  protected readonly otherBlocked = computed(() => fieldsBlockingOther(this.fields(), this.mapping()?.mappingKey));
  protected readonly otherClash = computed(() => otherKeyClashes(this.fields(), this.formData().derivedValues));
  /** The course choice (1.152): one per form, membership mappings only, audience = a derived value. */
  protected readonly courseIssues = computed(() => courseFieldIssues(this.fields(), this.mapping()?.mappingKey, this.formData().derivedValues));
  /** Everything the settings suite rejects across fields blocks saving here too, so a saved definition never fails there. */
  protected readonly hasKeyIssues = computed(() => this.duplicateKeys().length > 0 || this.misplacedSsn().length > 0
    || this.implicitSsn().length > 0 || this.otherBlocked().length > 0 || this.otherClash().length > 0 || this.courseIssues().length > 0);

  /** Fields inside a divider block with a rule — indented on the canvas. */
  protected readonly blockMembers = computed(() => conditionalBlockMembers(this.fields()));

  /** True once the field set differs from what was loaded — drives the save/discard banner. */
  protected isDirty = computed(() => JSON.stringify(this.previewDefinition().fields) !== this.originalFieldsJson());

  public ngOnInit(): void {
    const clone = safeStructuredClone(this.form());
    this.formData.set(clone ?? this.form());
    const sortedFields = [...(clone?.fields ?? [])].sort((a, b) => a.order - b.order);
    this.fields.set(sortedFields);
    this.originalFieldsJson.set(JSON.stringify(sortedFields));
  }

  protected addField(def: FieldTypeDef): void {
    const field = newField(def, this.fields().length);
    this.fields.update(fs => [...fs, field]);
  }

  /**
   * Deletes a field. When other fields' rules or derived values' cases reference it, asks first (naming them)
   * and then drops those conditions — a field rule left without conditions is removed, a derived case left
   * without conditions is dropped (an empty rule would hold for everyone). Saving writes the cleaned derived values.
   */
  protected async removeField(id: string): Promise<void> {
    const dependents = fieldsReferencing(this.fields(), id);
    const derivedDependents = derivedValuesReferencing(this.formData().derivedValues ?? [], id);
    if (dependents.length > 0 || derivedDependents.length > 0) {
      const names = [
        ...dependents.map(f => f.label || f.key),
        ...derivedDependents.map(d => `${this.i18n.derived_title()} «${d.key}»`),
      ].join(', ');
      const ok = await confirm(this.alertController, fill(this.i18n.field_remove_confirm(), { fields: names }),
        this.i18n.field_remove(), this.i18n.cancel(), true);
      if (!ok) return;
    }
    this.fields.update(fs => removeReferencesTo(fs.filter(f => f.id !== id), id).map((f, i) => ({ ...f, order: i })));
    if (derivedDependents.length > 0) {
      this.formData.update(fd => ({ ...fd, derivedValues: removeDerivedReferencesTo(fd.derivedValues ?? [], id) }));
    }
  }

  protected issueLabel(reason: RuleIssue['reason'] | DerivedRuleIssue['reason']): string {
    switch (reason) {
      case 'later': return this.i18n.rule_issue_later();
      case 'missing': return this.i18n.rule_issue_missing();
      case 'staleOp': return this.i18n.rule_issue_stale_op();
      default: return this.i18n.rule_issue_stale();
    }
  }

  /**
   * Copies `<origin>/public/<page>?<answers>` (spec §8); several pages showing the form → the author picks one.
   * The origin is `AppStore.appOrigin()`: the page's own origin on the web (so `localhost` while developing),
   * the tenant's `publicAppOrigin` only in a native build.
   * The clipboard write starts synchronously inside the click with the URL as a promise, so picking a page in the
   * alert never costs the user gesture (`copyToClipboardDeferred`). A cancelled pick copies nothing and says nothing.
   */
  protected async createLink(): Promise<void> {
    const pages = this.formPages();
    if (pages.length === 0) return;
    const url = (pages.length === 1 ? Promise.resolve(pages[0]) : this.pickPage(pages))
      .then(page => (page ? this.linkFor(page) : Promise.reject(new Error(LINK_CANCELLED))));
    // shown either way, so it can be copied by hand if the clipboard refuses
    url.then(link => this.copiedLink.set(link), () => undefined);
    try {
      await copyToClipboardDeferred(url);
      await showToast(this.toastController, this.i18n.preview_link_copied());
    } catch (err) {
      if ((err as Error | undefined)?.message !== LINK_CANCELLED) await showToast(this.toastController, this.i18n.source_copy_failed());
    }
  }

  private linkFor(page: PageModel): string {
    const { query } = this.prefillLink();
    const origin = this.appStore.appOrigin().replace(/\/+$/, '');
    return `${origin}/public/${encodeURIComponent(page.okey)}${query ? `?${query}` : ''}`;
  }

  /** A radio list of the pages that show the form; undefined when cancelled. */
  private async pickPage(pages: PageModel[]): Promise<PageModel | undefined> {
    if (pages.length === 0) return undefined;
    const alert = await this.alertController.create({
      header: this.i18n.preview_link(),
      inputs: pages.map((p, i) => ({ type: 'radio' as const, label: p.name || p.okey, value: p.okey, checked: i === 0 })),
      buttons: [
        { text: this.i18n.cancel(), role: 'cancel' },
        { text: this.i18n.ok(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onDidDismiss<{ values?: string }>();
    if (role !== 'confirm') return undefined;
    return pages.find(p => p.okey === data?.values);
  }

  /** the (i) in the canvas toolbar — read-only help for the form author */
  protected async onHelp(): Promise<void> {
    const modal = await this.modalController.create({
      component: FormBuilderHelpModal,
      componentProps: { i18n: this.i18n },
    });
    await modal.present();
  }

  protected async editField(field: Field): Promise<void> {
    const modal = await this.modalController.create({
      component: FieldConfigModal,
      // list-modal-wide draws the border that sets it apart from the editor behind it; auto-height shrinks it to its content
      cssClass: 'list-modal-wide auto-height-modal',
      componentProps: {
        field,
        i18n: this.i18n,
        categoryNames: this.appStore.allCategories().map(c => c.name),
        categories: this.appStore.allCategories(),
        fields: this.fields(),
        mapping: this.mapping(),
        derivedKeys: (this.formData().derivedValues ?? []).map(d => d.key),
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<Field>();
    if (role === 'confirm' && data) {
      this.fields.update(fs => fs.map(f => f.id === data.id ? data : f));
    }
  }

  protected onDrop(event: CdkDragDrop<Field[]>): void {
    const arr = [...this.fields()];
    if (event.previousContainer === event.container) {
      // reorder within the canvas
      moveItemInArray(arr, event.previousIndex, event.currentIndex);
    } else {
      // dropped from the palette — COPY a new field, never mutate the palette
      const def = event.item.data as FieldTypeDef;
      arr.splice(event.currentIndex, 0, newField(def, event.currentIndex));
    }
    this.fields.set(arr.map((f, i) => ({ ...f, order: i })));
  }

  public async save(): Promise<void> {
    if (this.hasKeyIssues()) return;   // the save button is disabled too; the warning above the canvas says why
    const fd = { ...this.formData(), fields: this.fields() };
    await this.formDefinitionService.update(fd, this.appStore.currentUser());
    await dismissOverlay(this.modalController, null, 'confirm');
  }

  /** Discard unsaved changes — revert to the originally loaded definition (a field deletion also cleaned its derived values). */
  public cancel(): void {
    const clone = safeStructuredClone(this.form());
    this.formData.set(clone ?? this.form());
    const sortedFields = [...(clone?.fields ?? [])].sort((a, b) => a.order - b.order);
    this.fields.set(sortedFields);
    this.originalFieldsJson.set(JSON.stringify(sortedFields));
  }

  /** Copy the form-definition JSON to the clipboard for external editing. */
  protected async copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sourceCode());
      this.sourceError.set(false);
      this.sourceMessage.set(this.i18n.source_copied());
    } catch {
      this.sourceError.set(true);
      this.sourceMessage.set(this.i18n.source_copy_failed());
    }
  }

  /** Parse externally-edited JSON from the clipboard and apply its fields to the builder. */
  protected async pasteSource(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await navigator.clipboard.readText());
    } catch {
      this.sourceError.set(true);
      this.sourceMessage.set(this.i18n.source_invalid_json());
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { fields?: unknown }).fields)) {
      this.sourceError.set(true);
      this.sourceMessage.set(this.i18n.source_invalid_format());
      return;
    }
    const incoming = parsed as Partial<FormDefinitionModel> & { fields: Field[] };
    // Normalise externally-edited fields (ensure id + order) and apply.
    const fields = incoming.fields.map((f, i) => ({ ...f, id: f.id ?? crypto.randomUUID(), order: f.order ?? i }))
      .sort((a, b) => a.order - b.order);
    // Apply editable definition props, but keep identity/ownership from the loaded form.
    const current = this.formData();
    this.formData.set({
      ...current, ...incoming,
      okey: current.okey, tenants: current.tenants, formKey: current.formKey,
      version: current.version, createdAt: current.createdAt, createdBy: current.createdBy,
      fields,
    });
    this.fields.set(fields);
    this.sourceError.set(false);
    this.sourceMessage.set(fill(this.i18n.source_applied(), { count: fields.length }));
  }
}
