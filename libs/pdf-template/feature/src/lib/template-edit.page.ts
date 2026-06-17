// libs/pdf-template/feature/src/lib/template-edit.page.ts
import {
  ChangeDetectionStrategy, Component, computed, effect, inject,
  linkedSignal, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
  IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
  IonCheckbox, IonBackButton,
} from '@ionic/angular/standalone';

import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ChangeConfirmation, ChangeConfirmationI18n } from '@bk2/shared-ui';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { newTemplateVersion, prettifyJson } from '@bk2/pdf-template-util';
import { TemplateService } from '@bk2/pdf-template-data-access';

import { TemplateStore } from './template.store';

type EditorTab = 'metadata' | 'html' | 'css' | 'preview';

@Component({
  selector: 'bk-template-edit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    FormsModule, SvgIconPipe, ChangeConfirmation,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
    IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
    IonCheckbox, IonBackButton,
  ],
  styles: [`
    .editor-area { width: 100%; font-family: monospace; font-size: 0.9rem; }
    /* The HTML tab makes ion-content's scroll area a flex column so the editor
       grows to fill the remaining height (no magic offsets). The min-height is a
       fallback for the case ::part(scroll) is not honoured. */
    ion-content.fill-content::part(scroll) {
      display: flex;
      flex-direction: column;
    }
    /* plain textarea fills the available height (ion-textarea can't be stretched
       reliably because its native element lives in shadow DOM) */
    .code-editor {
      width: 100%;
      flex: 1 1 auto;
      min-height: calc(100dvh - 180px);
      box-sizing: border-box;
      padding: 12px;
      font-family: monospace;
      font-size: 0.9rem;
      line-height: 1.4;
      border: 1px solid var(--ion-color-step-250, #c8c8c8);
      border-radius: 6px;
      resize: none;
      background: var(--ion-background-color, #fff);
      color: var(--ion-text-color, #000);
    }
    .code-editor:focus { outline: none; border-color: var(--ion-color-primary); }
    .preview-frame { width: 100%; height: calc(100dvh - 180px); border: none; }
    .preview-placeholder { display: flex; align-items: center; justify-content: center; height: 300px; }
    ion-segment { margin: 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/templates" />
        </ion-buttons>
        <ion-title>
          {{ template()?.name || 'Vorlage' }} · v{{ editorVersion().version }}
          {{ readOnly() ? '(Veröffentlicht)' : '(Entwurf)' }}
        </ion-title>
        @if(!readOnly() && hasSavedDraft()) {
          <ion-buttons slot="end">
            <ion-button fill="solid" color="primary" (click)="publish()" [disabled]="saving()">
              Veröffentlichen
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>

      @if(showConfirmation()) {
        <bk-change-confirmation [i18n]="changeConfirmationI18n()"
          (saveClicked)="save()" (cancelClicked)="cancel()" />
      }

      <ion-segment [ngModel]="activeTab()" (ngModelChange)="onTabChange($any($event))">
        <ion-segment-button value="metadata"><ion-label>Metadaten</ion-label></ion-segment-button>
        <ion-segment-button value="html"><ion-label>HTML</ion-label></ion-segment-button>
        <ion-segment-button value="preview"><ion-label>Vorschau</ion-label></ion-segment-button>
      </ion-segment>
    </ion-header>

    <ion-content class="ion-padding" [class.fill-content]="activeTab() === 'html'">
      @if(activeTab() === 'metadata') {
        @if(template(); as tmpl) {
          <ion-item>
            <ion-label position="stacked">Name</ion-label>
            <ion-input [ngModel]="tmpl.name" (ngModelChange)="onTemplateFieldChange('name', $event)" [disabled]="readOnly()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beschreibung</ion-label>
            <ion-input [ngModel]="tmpl.description" (ngModelChange)="onTemplateFieldChange('description', $event)" [disabled]="readOnly()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Kategorie</ion-label>
            <ion-select [ngModel]="tmpl.category" (ngModelChange)="onTemplateFieldChange('category', $event)" [disabled]="readOnly()">
              <ion-select-option value="invoice">Rechnung</ion-select-option>
              <ion-select-option value="expense">Spesen</ion-select-option>
              <ion-select-option value="report">Bericht</ion-select-option>
              <ion-select-option value="dunning">Mahnung</ion-select-option>
              <ion-select-option value="other">Sonstiges</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Sprache</ion-label>
            <ion-select [ngModel]="tmpl.language" (ngModelChange)="onTemplateFieldChange('language', $event)" [disabled]="readOnly()">
              <ion-select-option value="de">Deutsch</ion-select-option>
              <ion-select-option value="fr">Français</ion-select-option>
              <ion-select-option value="it">Italiano</ion-select-option>
              <ion-select-option value="en">English</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Ausgabeformat</ion-label>
            <ion-select [ngModel]="tmpl.defaultOutputFormat" (ngModelChange)="onTemplateFieldChange('defaultOutputFormat', $event)" [disabled]="readOnly()">
              <ion-select-option value="pdf">PDF</ion-select-option>
              <ion-select-option value="docx">DOCX</ion-select-option>
              <ion-select-option value="html">HTML</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beispieldaten (JSON)</ion-label>
            <ion-textarea
              [ngModel]="tmpl.sampleData"
              (ngModelChange)="onTemplateFieldChange('sampleData', $event)"
              class="editor-area"
              [rows]="14"
              autoGrow="false"
              [disabled]="readOnly()"
              placeholder='{}'
            />
          </ion-item>
          <ion-item>
            <ion-checkbox
              [checked]="tmpl.attachQrSlip"
              (ionChange)="onTemplateFieldChange('attachQrSlip', $any($event).detail.checked)"
              [disabled]="readOnly()">
              QR-Einzahlungsschein anhängen
            </ion-checkbox>
          </ion-item>
          <ion-item>
            <ion-checkbox
              [checked]="tmpl.qrSlipWithAmount"
              (ionChange)="onTemplateFieldChange('qrSlipWithAmount', $any($event).detail.checked)"
              [disabled]="readOnly() || !tmpl.attachQrSlip">
              Betrag im Einzahlungsschein ausfüllen
            </ion-checkbox>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Zahlungsempfänger-Organisation (Org-ID, leer = Standard-Org)</ion-label>
            <ion-input [ngModel]="tmpl.payeeOrgId" (ngModelChange)="onTemplateFieldChange('payeeOrgId', $event)" [disabled]="readOnly()" />
          </ion-item>
        }
      }

      @if(activeTab() === 'html') {
        <textarea
          class="code-editor"
          [value]="editorVersion().html"
          (input)="onVersionChange('html', $any($event.target).value)"
          [readOnly]="readOnly()"
          spellcheck="false"
          placeholder="HTML / Handlebars …"
        ></textarea>
      }

      @if(activeTab() === 'preview') {
        @if(store.previewLoading()) {
          <div class="preview-placeholder">
            <ion-spinner name="crescent" />
          </div>
        } @else if(safePreviewUrl(); as url) {
          <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
            <ion-button fill="outline" size="small" (click)="downloadPreview()">
              <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
              Herunterladen
            </ion-button>
          </div>
          <iframe [src]="url" class="preview-frame" title="Vorschau"></iframe>
        } @else {
          <div class="preview-placeholder">
            <p>Keine Vorschau verfügbar.</p>
          </div>
        }
      }
    </ion-content>
  `
})
export class TemplateEditPage {
  protected readonly store = inject(TemplateStore);
  private readonly templateService = inject(TemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly templateKey = signal<string>('');
  protected readonly activeTab = signal<EditorTab>('metadata');
  protected readonly saving = signal(false);
  // read-only view of the current published version (?mode=view)
  protected readonly readOnly = signal(false);
  // tracks unsaved edits; drives the change-confirmation banner (no save button)
  protected readonly dirty = signal(false);
  protected readonly showConfirmation = computed(() => this.dirty() && !this.readOnly());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.store.i18n.cancel(),
    save:   this.store.i18n.save(),
  } as ChangeConfirmationI18n));

  // Local mutable copy of the template for editing
  private readonly _localTemplate = signal<TemplateModel | undefined>(undefined);

  private readonly _templateResource = rxResource({
    params: this.templateKey,
    stream: ({ params: key }) =>
      key ? this.templateService.read(key) : of(undefined),
  });

  private readonly _versions = rxResource({
    params: this.templateKey,
    stream: ({ params: key }) =>
      key ? this.templateService.listVersions(key) : of([]),
  });

  // Expose the local copy for the template; seed it from the resource when it loads
  protected readonly template = computed<TemplateModel | undefined>(() => {
    const local = this._localTemplate();
    if (local !== undefined) return local;
    return this._templateResource.value();
  });

  protected readonly draftVersion = linkedSignal<TemplateVersionModel>(() => this.deriveDraftVersion());

  /** Derive the editable draft version from the loaded template + versions. */
  private deriveDraftVersion(): TemplateVersionModel {
    const tmpl = this._templateResource.value();
    const versions = this._versions.value() ?? [];
    if (!tmpl) return newTemplateVersion(1);
    const draft = tmpl.draftVersion;
    if (draft) {
      return versions.find((v: TemplateVersionModel) => v.version === draft) ?? newTemplateVersion(draft);
    }
    // No active draft → start a new draft seeded from the current published version.
    // The next version number must not collide with any existing version (e.g. a
    // higher version kept after a rollback), so use max(existing, current) + 1.
    const maxVersion = versions.reduce(
      (max: number, v: TemplateVersionModel) => Math.max(max, v.version),
      tmpl.currentVersion ?? 0
    );
    const next = newTemplateVersion(maxVersion + 1);
    const current = versions.find((v: TemplateVersionModel) => v.version === tmpl.currentVersion);
    if (current) {
      next.html = current.html;
      next.css = current.css;
      next.partials = current.partials;
      next.assets = current.assets;
    }
    return next;
  }

  // The version shown in the editor: the current published version in read-only
  // view mode, otherwise the editable draft.
  protected readonly editorVersion = computed<TemplateVersionModel>(() => {
    if (this.readOnly()) {
      const tmpl = this._templateResource.value();
      const versions = this._versions.value() ?? [];
      return versions.find((v: TemplateVersionModel) => v.version === tmpl?.currentVersion)
        ?? this.draftVersion();
    }
    return this.draftVersion();
  });

  // Publish is only possible once the draft being edited has actually been saved,
  // i.e. its version document exists in the (live) versions list.
  protected readonly hasSavedDraft = computed(() => {
    const versions = this._versions.value() ?? [];
    const draftNum = this.draftVersion().version;
    return versions.some((v: TemplateVersionModel) => v.version === draftNum);
  });

  protected readonly safePreviewUrl = computed((): SafeResourceUrl | null => {
    const url = this.store.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const key = this.route.snapshot.paramMap.get('templateKey');
      if (key) this.templateKey.set(key);
      this.readOnly.set(this.route.snapshot.queryParamMap.get('mode') === 'view');
    }, { allowSignalWrites: true });

    // Seed _localTemplate from resource once it loads
    effect(() => {
      const loaded = this._templateResource.value();
      if (loaded && this._localTemplate() === undefined) {
        const cloned = safeStructuredClone(loaded);
        if (cloned) {
          // show the sample data structured/indented for easier editing
          cloned.sampleData = prettifyJson(cloned.sampleData);
        }
        this._localTemplate.set(cloned ?? undefined);
      }
    }, { allowSignalWrites: true });
  }

  protected onTemplateFieldChange(field: keyof TemplateModel, value: unknown): void {
    const current = this.template();
    if (!current) return;
    const cloned = safeStructuredClone(current);
    if (!cloned) return;
    (cloned as unknown as Record<string, unknown>)[field as string] = value;
    this._localTemplate.set(cloned);
    this.dirty.set(true);
  }

  protected onVersionChange(field: 'html' | 'css', value: string): void {
    const v = safeStructuredClone(this.draftVersion());
    if (!v) return;
    v[field] = value;
    this.draftVersion.set(v);
    this.dirty.set(true);
  }

  /** Persist the metadata + draft version (driven by the change-confirmation banner). */
  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const draft = this.draftVersion();
      await this.store.saveDraft(this.templateKey(), draft);
      const tmpl = this.template();
      if (tmpl) {
        // Record the active draft on the template so re-editing reuses this version
        // instead of allocating a new number every save (which orphans drafts).
        const updated = { ...tmpl, draftVersion: draft.version };
        this._localTemplate.set(updated);
        await this.store.updateTemplate(updated);
      }
      this.dirty.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  /** Discard unsaved edits and revert to the last loaded state. */
  protected cancel(): void {
    this._localTemplate.set(undefined);        // re-seeds from the resource via the effect
    this.draftVersion.set(this.deriveDraftVersion());
    this.dirty.set(false);
  }

  protected async publish(): Promise<void> {
    await this.save();
    await this.store.openPublishDialog(this.templateKey(), this.draftVersion().version);
  }

  /** Switch tabs; generating the preview automatically when the preview tab opens. */
  protected onTabChange(tab: EditorTab): void {
    this.activeTab.set(tab);
    if (tab === 'preview') void this.refreshPreview();
  }

  protected async refreshPreview(): Promise<void> {
    // The renderer reads the version from Firestore, so the current draft must be
    // persisted first. save() also records draftVersion, so the version number
    // stays stable (no orphan/incrementing drafts). Read-only views the published
    // version, which already exists — no save needed.
    if (!this.readOnly() && (this.dirty() || !this.hasSavedDraft())) {
      await this.save();
    }
    await this.store.generatePreview(
      this.templateKey(),
      this.editorVersion(),
      this.template()?.sampleData ?? '{}',
      false,
    );
  }

  protected downloadPreview(): void {
    const url = this.store.previewUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `preview-${this.templateKey()}.pdf`;
    a.click();
  }
}
